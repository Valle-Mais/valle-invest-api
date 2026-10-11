import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { Firestore } from '@google-cloud/firestore';
import { CreateFundOperationDto } from './dto/create-fund-operation.dto';
import { UpdateFundOperationDto } from './dto/update-fund-operation.dto';
import { FundOperation } from './entities/fund-operation.entity';
import { ClientTransactionsService } from 'src/client-transactions/client-transactions.service';
import { FindAllFundOperationsDto } from './dto/find-all-fund-operations.dto';
import { PaginatedFundOperationResponseDto } from './dto/paginated-fund-operation-response.dto';
import {
  balancesAsOf,
  distribute,
  OperationStats,
  RateioTransaction,
  replayOperations,
  round2,
  sumBalances,
} from './rateio';
import { monthlyReturnFromRates } from 'src/performance/monthly-return';

export interface MonthlyReturn {
  year: number;
  month: number;
  returnValue: number;
}

type OpRecord = FundOperation & { id: string; registradaEm?: Date };

/** Mudança aplicada na mesma transação do reprocessamento. */
export interface ReprocessChanges {
  /** Operação nova ou editada, gravada junto com os rendimentos. */
  upsert?: OpRecord;
  /** Operação excluída: seus rendimentos saem e as posteriores são refeitas. */
  removeId?: string;
}

export interface ReprocessSummary {
  /** Operações reprocessadas (data >= startDate). */
  operations: number;
  /** Rendimentos apagados. */
  deletedYields: number;
  /** Rendimentos gravados. */
  createdYields: number;
  /** Base e taxa de cada operação reprocessada. */
  stats: Map<string, OperationStats>;
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return new Date(value as string);
}

@Injectable()
export class FundOperationsService {
  private readonly logger = new Logger(FundOperationsService.name);
  private readonly collectionName = 'fund_operations';

  constructor(
    @Inject('FIRESTORE') private readonly firestore: Firestore,
    @Inject(forwardRef(() => ClientTransactionsService))
    private readonly transactionsService: ClientTransactionsService,
  ) {}

  /** Campos persistidos da operação (sem `id` nem o derivado `registradaEm`). */
  private toDocument(op: OpRecord): Omit<FundOperation, 'id'> {
    const { id: _id, registradaEm: _r, ...payload } = op;
    void _id;
    void _r;
    return payload;
  }

  private parseLocalDate(dateString: string): Date {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  /** Operação com `registradaEm`: campo `createdAt` ou, para documentos antigos, o `createTime` do Firestore. */
  private mapOperation(doc: FirebaseFirestore.DocumentSnapshot): OpRecord {
    const data = doc.data() ?? {};
    const registradaEm = data.createdAt
      ? toDate(data.createdAt)
      : doc.createTime
        ? doc.createTime.toDate()
        : undefined;
    return {
      ...(data as Omit<FundOperation, 'data'>),
      id: doc.id,
      data: toDate(data.data),
      createdAt: registradaEm,
      registradaEm,
    } as OpRecord;
  }

  private mapTransaction(
    doc: FirebaseFirestore.QueryDocumentSnapshot,
  ): RateioTransaction & { id: string } {
    const data = doc.data();
    return {
      id: doc.id,
      clientId: data.clientId,
      clientName: data.clientName,
      tipo: data.tipo,
      valor: data.valor,
      data: toDate(data.data),
      status: data.status,
      operationId: data.operationId,
      // Momento em que passou a contar: `approvedAt` ou, para documentos antigos, o createTime.
      efetivadaEm: data.approvedAt
        ? toDate(data.approvedAt)
        : doc.createTime
          ? doc.createTime.toDate()
          : undefined,
    };
  }

  // ====================================================================
  // MOTOR DE REPROCESSAMENTO (Fase 1.5)
  // ====================================================================

  /**
   * Refaz, numa única transação do Firestore, os rendimentos de todas as
   * operações com `data >= startDate`:
   *
   * 1. lê todas as operações (aplicando `changes`) e todas as transações aprovadas;
   * 2. apaga os rendimentos das operações afetadas (por `operationId`), mais os
   *    rendimentos legados sem `operationId` e os órfãos a partir de `startDate`;
   * 3. percorre as operações afetadas em ordem cronológica; a base de cada uma
   *    são as transações com data até a dela, inclusive (ver `rateio.ts`);
   * 4. grava os rendimentos novos com `taxa`, grava `patrimonioBase`/`taxa` nas
   *    operações e atualiza `totalInvestido`/`status` dos clientes.
   *
   * Rendimentos de operações anteriores a `startDate` não são tocados.
   */
  public async reprocessOperationsFrom(
    startDate: Date,
    changes: ReprocessChanges = {},
  ): Promise<ReprocessSummary> {
    this.logger.warn(
      `Reprocessamento a partir de ${startDate.toISOString()} iniciado.`,
    );
    const cutoff = startDate.getTime();

    const summary = await this.firestore.runTransaction(async (t) => {
      // ---------- Leitura ----------
      const opsSnapshot = await t.get(
        this.firestore.collection(this.collectionName),
      );
      let allOps = opsSnapshot.docs.map((doc) => this.mapOperation(doc));
      if (changes.removeId)
        allOps = allOps.filter((op) => op.id !== changes.removeId);
      if (changes.upsert) {
        allOps = allOps.filter((op) => op.id !== changes.upsert!.id);
        allOps.push(changes.upsert);
      }
      const allOpIds = new Set(allOps.map((op) => op.id));
      const affected = allOps.filter((op) => op.data.getTime() >= cutoff);
      const affectedIds = new Set(affected.map((op) => op.id));

      const transSnapshot = await t.get(
        this.firestore
          .collection('client_transactions')
          .where('status', '==', 'Aprovado'),
      );
      const approved = transSnapshot.docs.map((doc) =>
        this.mapTransaction(doc),
      );

      const toDelete: string[] = [];
      const ledger: RateioTransaction[] = [];
      for (const tx of approved) {
        if (tx.tipo === 'Rendimento') {
          const orphan =
            tx.data.getTime() >= cutoff &&
            (!tx.operationId || !allOpIds.has(tx.operationId));
          const ofAffected =
            !!tx.operationId && affectedIds.has(tx.operationId);
          const ofRemoved =
            !!changes.removeId && tx.operationId === changes.removeId;
          if (orphan || ofAffected || ofRemoved) {
            toDelete.push(tx.id);
            continue;
          }
        }
        ledger.push(tx);
      }

      const replay = replayOperations(affected, ledger);

      // Clientes a atualizar: todos com saldo calculado. Lemos antes de escrever
      // (regra do Firestore) para não falhar em transação de cliente já excluído.
      const clientIds = [...replay.finalBalances.keys()];
      const userRefs = clientIds.map((id) =>
        this.firestore.collection('users').doc(id),
      );
      const userSnaps = await Promise.all(userRefs.map((ref) => t.get(ref)));

      // ---------- Escrita ----------
      for (const id of toDelete) {
        t.delete(this.firestore.collection('client_transactions').doc(id));
      }
      for (const y of replay.yields) {
        const { efetivadaEm, ...record } = y;
        t.set(this.firestore.collection('client_transactions').doc(), {
          ...record,
          ...(efetivadaEm ? { approvedAt: efetivadaEm } : {}),
        });
      }
      for (const op of affected) {
        const ref = this.firestore.collection(this.collectionName).doc(op.id);
        const stats = replay.stats.get(op.id) ?? { patrimonioBase: 0, taxa: 0 };
        if (changes.upsert && op.id === changes.upsert.id) {
          t.set(ref, { ...this.toDocument(changes.upsert), ...stats });
        } else {
          t.update(ref, {
            patrimonioBase: stats.patrimonioBase,
            taxa: stats.taxa,
          });
        }
      }
      if (changes.upsert && !affectedIds.has(changes.upsert.id)) {
        // Edição que moveu a operação para antes de startDate não acontece
        // (startDate é sempre a menor data envolvida), mas por segurança gravamos.
        t.set(
          this.firestore.collection(this.collectionName).doc(changes.upsert.id),
          this.toDocument(changes.upsert),
        );
      }
      if (changes.removeId) {
        t.delete(
          this.firestore.collection(this.collectionName).doc(changes.removeId),
        );
      }
      userSnaps.forEach((snap, i) => {
        const clientId = clientIds[i];
        if (!snap.exists) {
          this.logger.warn(
            `Cliente ${clientId} tem transações mas não existe em users; saldo não atualizado.`,
          );
          return;
        }
        const balance = round2(replay.finalBalances.get(clientId)!.balance);
        t.update(userRefs[i], {
          totalInvestido: balance,
          status: balance > 0 ? 'Ativo' : 'Inativo',
        });
      });

      return {
        operations: affected.length,
        deletedYields: toDelete.length,
        createdYields: replay.yields.length,
        stats: replay.stats,
      } as ReprocessSummary;
    });

    this.logger.warn(
      `Reprocessamento concluído: ${summary.operations} operações, ${summary.deletedYields} rendimentos apagados, ${summary.createdYields} gravados.`,
    );
    return summary;
  }

  /**
   * Chamada quando um aporte/resgate aprovado é criado, editado ou removido.
   * Operações com data igual ou posterior à transação têm a base alterada (regra
   * do mesmo dia em `rateio.ts`); se existir alguma, reprocessa a partir da primeira.
   */
  public async triggerReprocessingIfNecessary(
    transactionDate: Date,
  ): Promise<void> {
    const firstOpSnapshot = await this.firestore
      .collection(this.collectionName)
      .where('data', '>=', transactionDate)
      .orderBy('data', 'asc')
      .limit(1)
      .get();

    if (firstOpSnapshot.empty) {
      this.logger.log(
        `Nenhuma operação em ou após ${transactionDate.toISOString()}; reprocessamento desnecessário.`,
      );
      return;
    }

    const firstOp = this.mapOperation(firstOpSnapshot.docs[0]);
    this.logger.log(
      `Transação afeta a operação ${firstOp.id} de ${firstOp.data.toISOString()}.`,
    );
    await this.reprocessOperationsFrom(firstOp.data);
  }

  /**
   * Simula o rateio sem gravar nada, com a mesma base que a operação teria:
   * saldo de cada cliente formado pelas transações até a data informada, inclusive.
   * Sem data, usa todas as transações aprovadas.
   */
  async previewDistribution(
    resultado: number,
    data?: string,
  ): Promise<{
    patrimonioBase: number;
    taxa: number;
    clientes: {
      clientId: string;
      name: string;
      saldo: number;
      lucro: number;
      novoSaldo: number;
    }[];
  }> {
    const snapshot = await this.firestore
      .collection('client_transactions')
      .where('status', '==', 'Aprovado')
      .get();
    const approved = snapshot.docs.map((doc) => this.mapTransaction(doc));

    // Simula uma operação registrada agora: entra tudo que já estava efetivado.
    const balances = data
      ? balancesAsOf(
          { data: this.parseLocalDate(data), registradaEm: new Date() },
          approved,
        )
      : sumBalances(approved);
    const dist = distribute(resultado, balances);

    return {
      patrimonioBase: dist.patrimonioBase,
      taxa: dist.taxa,
      clientes: dist.shares.map((s) => ({
        clientId: s.clientId,
        name: s.name,
        saldo: s.saldo,
        lucro: s.lucro,
        novoSaldo: round2(s.saldo + s.lucro),
      })),
    };
  }

  // ====================================================================
  // CRUD (toda mutação passa pelo reprocessamento)
  // ====================================================================

  async create(createDto: CreateFundOperationDto): Promise<FundOperation> {
    const resultado =
      createDto.resultado ??
      (createDto.valorVenda !== undefined &&
      createDto.valorInvestido !== undefined
        ? round2(createDto.valorVenda - createDto.valorInvestido)
        : 0);
    const data = this.parseLocalDate(createDto.data);
    const ref = this.firestore.collection(this.collectionName).doc();

    const createdAt = new Date();
    const operation: OpRecord = {
      id: ref.id,
      data,
      descricao: createDto.descricao ?? '',
      valorInvestido: createDto.valorInvestido ?? 0,
      valorVenda: createDto.valorVenda ?? 0,
      resultado,
      createdAt,
      registradaEm: createdAt,
    };

    const summary = await this.reprocessOperationsFrom(data, {
      upsert: operation,
    });
    return { ...operation, ...summary.stats.get(ref.id) };
  }

  async update(
    id: string,
    updateDto: UpdateFundOperationDto,
  ): Promise<FundOperation> {
    const existing = await this.findOne(id);

    const merged: OpRecord = {
      id,
      data: updateDto.data
        ? this.parseLocalDate(updateDto.data)
        : existing.data,
      descricao: updateDto.descricao ?? existing.descricao ?? '',
      valorInvestido: updateDto.valorInvestido ?? existing.valorInvestido ?? 0,
      valorVenda: updateDto.valorVenda ?? existing.valorVenda ?? 0,
      resultado: existing.resultado,
      createdAt: existing.createdAt,
      registradaEm: existing.registradaEm,
    };
    const valoresMudaram =
      updateDto.valorInvestido !== undefined ||
      updateDto.valorVenda !== undefined;
    merged.resultado =
      updateDto.resultado ??
      (valoresMudaram
        ? round2(merged.valorVenda - merged.valorInvestido)
        : existing.resultado);

    const startDate = new Date(
      Math.min(existing.data.getTime(), merged.data.getTime()),
    );
    const summary = await this.reprocessOperationsFrom(startDate, {
      upsert: merged,
    });
    return { ...merged, ...summary.stats.get(id) };
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findOne(id);
    await this.reprocessOperationsFrom(existing.data, { removeId: id });
  }

  // ====================================================================
  // LEITURA
  // ====================================================================

  async findAll(
    queryDto: FindAllFundOperationsDto,
  ): Promise<PaginatedFundOperationResponseDto> {
    const {
      page = 1,
      limit = 10,
      sortBy = 'data',
      sortOrder = 'desc',
      startDate,
      endDate,
      tipo,
    } = queryDto;

    let query: FirebaseFirestore.Query = this.firestore.collection(
      this.collectionName,
    );

    if (tipo) query = query.where('tipo', '==', tipo);
    if (startDate) query = query.where('data', '>=', new Date(startDate));
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query = query.where('data', '<=', end);
    }

    query = query.orderBy(sortBy, sortOrder as 'asc' | 'desc');
    if (sortBy !== 'data') query = query.orderBy('data', 'desc');

    const totalSnapshot = await query.count().get();
    const total = totalSnapshot.data().count;
    if (total === 0) return { data: [], total: 0 };

    if (page > 1) {
      const prevPageSnapshot = await query.limit((page - 1) * limit).get();
      const lastDoc = prevPageSnapshot.docs[prevPageSnapshot.docs.length - 1];
      if (lastDoc) query = query.startAfter(lastDoc);
    }

    const snapshot = await query.limit(limit).get();
    const results = snapshot.docs.map((doc) => this.mapOperation(doc));
    return { data: results, total };
  }

  async findOne(id: string): Promise<OpRecord> {
    const doc = await this.firestore
      .collection(this.collectionName)
      .doc(id)
      .get();
    if (!doc.exists) {
      throw new NotFoundException(`Operação com ID ${id} não encontrada.`);
    }
    return this.mapOperation(doc);
  }

  // ====================================================================
  // RENTABILIDADE MENSAL DO FUNDO
  // ====================================================================

  /**
   * Rentabilidade mensal do fundo. Com `taxa` gravada nas operações (Fase 1.5),
   * o mês é o produto de (1 + taxa) das operações dele. Para meses com operação
   * ainda sem taxa (antes do backfill), cai na fórmula antiga
   * `lucro / (patrimônio anterior + aportes)`.
   */
  async getMonthlyReturns(): Promise<MonthlyReturn[]> {
    const [fundOpsResponse, clientTrans] = await Promise.all([
      this.findAll({ page: 1, limit: 9999, sortBy: 'data' }),
      this.transactionsService.findAll({}),
    ]);
    const fundOps = fundOpsResponse.data;

    const allDates = [
      ...fundOps.map((op) => op.data),
      ...clientTrans.map((t) => t.data),
    ].filter((d) => d && !isNaN(d.getTime()));
    if (allDates.length === 0) return [];

    const monthlyData = new Map<
      string,
      {
        lucro: number;
        aportes: number;
        resgates: number;
        taxas: Array<number | undefined>;
      }
    >();
    const bucket = (key: string) => {
      if (!monthlyData.has(key))
        monthlyData.set(key, { lucro: 0, aportes: 0, resgates: 0, taxas: [] });
      return monthlyData.get(key)!;
    };

    fundOps.forEach((op) => {
      const b = bucket(`${op.data.getFullYear()}-${op.data.getMonth()}`);
      b.lucro += op.resultado;
      b.taxas.push(op.taxa);
    });

    clientTrans
      .filter((t) => t.status === 'Aprovado')
      .forEach((t) => {
        const b = bucket(`${t.data.getFullYear()}-${t.data.getMonth()}`);
        if (t.tipo === 'Aporte') b.aportes += t.valor;
        else if (t.tipo === 'Resgate') b.resgates += t.valor;
      });

    const monthlyReturns: MonthlyReturn[] = [];
    let patrimonioAnterior = 0;
    const firstDate = new Date(Math.min(...allDates.map((d) => d.getTime())));
    const lastDate = new Date(Math.max(...allDates.map((d) => d.getTime())));
    const currentDate = new Date(
      firstDate.getFullYear(),
      firstDate.getMonth(),
      1,
    );

    while (currentDate <= lastDate) {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const m = monthlyData.get(`${year}-${month}`) ?? {
        lucro: 0,
        aportes: 0,
        resgates: 0,
        taxas: [],
      };

      const rentabilidade = monthlyReturnFromRates(m.taxas, {
        profit: m.lucro,
        base: patrimonioAnterior + m.aportes,
      });
      monthlyReturns.push({ year, month, returnValue: rentabilidade * 100 });

      patrimonioAnterior =
        patrimonioAnterior + m.aportes + m.lucro - m.resgates;
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    return monthlyReturns;
  }
}
