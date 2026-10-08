/* eslint-disable prettier/prettier */
import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { CreateFundOperationDto } from './dto/create-fund-operation.dto';
import { UpdateFundOperationDto } from './dto/update-fund-operation.dto';
import { Firestore } from '@google-cloud/firestore';
import { FundOperation } from './entities/fund-operation.entity';
import { ClientTransactionsService } from 'src/client-transactions/client-transactions.service';
import { FindAllFundOperationsDto } from './dto/find-all-fund-operations.dto';
import { PaginatedFundOperationResponseDto } from './dto/paginated-fund-operation-response.dto';

export interface MonthlyReturn {
  year: number;
  month: number;
  returnValue: number;
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

  private parseLocalDate(dateString: string): Date {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }


public async reprocessOperationsFrom(startDate: Date) {
    this.logger.warn(
      `INICIANDO REPROCESSAMENTO DE HISTÓRICO a partir de ${startDate.toISOString()}`,
    );

    // 1. Encontrar operações (Leitura fora da transação)
    const opsQuery = this.firestore
      .collection(this.collectionName)
      .where('data', '>=', startDate)
      .orderBy('data', 'asc');

    const opsSnapshot = await opsQuery.get();
    if (opsSnapshot.empty) {
      this.logger.log('Reprocessamento: Nenhuma operação de fundo encontrada.');
      return;
    }

    const operationsToReprocess = opsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as (FundOperation & { id: string })[];

    this.logger.log(
      `Reprocessamento: ${operationsToReprocess.length} operações de fundo serão refeitas.`,
    );

    // 2. EXECUTAR A TRANSAÇÃO ATÔMICA
    await this.firestore.runTransaction(async (t) => {
      
      // ===================================
      // === ETAPA 1: FASE DE LEITURA ===
      // ===================================
      this.logger.log('[Transação-READ] Iniciando fase de leitura...');

      // 1a. Encontrar todos os rendimentos antigos para deletar
      const oldYieldRefsToDelete: FirebaseFirestore.DocumentReference[] = [];
      
      // Busca por TIPO e DATA, não por operationId
      const oldYieldQueries = operationsToReprocess.map((op) =>
        t.get(
          this.firestore
            .collection('client_transactions')
            .where('tipo', '==', 'Rendimento') // <-- Garante que é um rendimento
            .where('data', '==', op.data), // <-- Encontra pela data da operação
        ),
      );
      
      const allOldYieldSnapshots = await Promise.all(oldYieldQueries);
      allOldYieldSnapshots.forEach((snapshot) => {
        snapshot.forEach((doc) => {
            // Evita deletar duas vezes se a query pegar o mesmo doc
            if (!oldYieldRefsToDelete.some(ref => ref.id === doc.id)) {
                oldYieldRefsToDelete.push(doc.ref);
            }
        });
      });
      this.logger.log(`[Transação-READ] ${oldYieldRefsToDelete.length} rendimentos antigos (por data) serão deletados.`);


      // 1b. Ler o estado ATUAL de TODAS as transações de clientes
      const allTransQuery = this.firestore
        .collection('client_transactions')
        .where('status', '==', 'Aprovado');
      const allTransSnapshot = await t.get(allTransQuery);
      this.logger.log(`[Transação-READ] Estado lido de ${allTransSnapshot.size} transações aprovadas.`);


      // ===================================
      // === ETAPA 2: FASE DE ESCRITA ===
      // ===================================
      this.logger.log('[Transação-WRITE] Iniciando fase de escrita...');

      // 2a. Deletar todos os rendimentos antigos
      oldYieldRefsToDelete.forEach((ref) => t.delete(ref));
      if (oldYieldRefsToDelete.length > 0) {
           this.logger.log(`[Transação-WRITE] ${oldYieldRefsToDelete.length} rendimentos antigos marcados para deleção.`);
      }

      // 2b. Recalcular e recriar os rendimentos
      const clientBalances = new Map<string, { balance: number, name: string }>();
      
      allTransSnapshot.docs.forEach(doc => {
          const tr = doc.data();
          if (!tr.clientId) return;

          // IMPORTANTE: Ignore os rendimentos antigos que acabamos de deletar!
          const isOldYield = oldYieldRefsToDelete.some(ref => ref.id === doc.id);
          if (isOldYield) {
              this.logger.log(`[Transação-CALC] Ignorando transação deletada ${doc.id} do cálculo de saldo.`);
              return;
          }

          if (!clientBalances.has(tr.clientId)) {
              clientBalances.set(tr.clientId, { balance: 0, name: tr.clientName || 'Nome não encontrado' });
          }
          const clientData = clientBalances.get(tr.clientId)!;
          
          if (tr.tipo === 'Aporte' || tr.tipo === 'Rendimento') {
              clientData.balance += tr.valor;
          } else if (tr.tipo === 'Resgate') {
              clientData.balance -= tr.valor;
          }
          if (!clientData.name && tr.clientName) clientData.name = tr.clientName;
      });
      this.logger.log(`[Transação-CALC] Saldo base inicial calculado para ${clientBalances.size} clientes.`);


      // Agora, processe cada operação cronologicamente
      for (const op of operationsToReprocess) {
        this.logger.log(`[Transação-CALC/WRITE] Processando OpID: ${op.id} (Resultado: ${op.resultado})`);
        if (op.resultado === 0) continue;

        // Calcular patrimônio total NAQUELE MOMENTO
        const activeClients = new Map<string, { balance: number, name: string }>();
        let patrimonioTotal = 0;
        clientBalances.forEach((data, clientId) => {
            if (data.balance > 0) {
                activeClients.set(clientId, data);
                patrimonioTotal += data.balance;
            }
        });

        if (patrimonioTotal <= 0) {
          this.logger.warn(`[Transação-CALC] Patrimônio total para OpID ${op.id} é zero. Pulando distribuição.`);
          continue;
        }

        const rentabilidade = op.resultado / patrimonioTotal;
        
        // Criar as novas transações de rendimento e atualizar os saldos
        activeClients.forEach((clientData, clientId) => {
            const transactionDocRef = this.firestore.collection('client_transactions').doc();

            const lucroCliente = clientData.balance * rentabilidade;
            const novoSaldo = clientData.balance + lucroCliente;
            
            // Cria o registro de rendimento
            t.set(transactionDocRef, {
                clientId: clientId,
                clientName: clientData.name,
                data: op.data,
                tipo: 'Rendimento',
                valor: lucroCliente,
                status: 'Aprovado',
                operationId: op.id, // O vínculo
            });
            
            // Atualiza o mapa de saldos para a próxima iteração
            clientData.balance = novoSaldo;
        });
      } // --- Fim do loop for(op...) ---

      
      // 2c. Atualizar o 'totalInvestido' final dos clientes
      // Neste ponto, o loop 'for' terminou e o mapa 'clientBalances'
      // contém o saldo final e correto de todos os clientes.
      
      this.logger.log(`[Transação-WRITE] Atualizando 'totalInvestido' final para ${clientBalances.size} clientes...`);
      
      clientBalances.forEach((data, clientId) => {
          const clientDocRef = this.firestore.collection('users').doc(clientId);
          // Bônus: Também corrigimos o status do cliente (Ativo/Inativo)
          const newStatus = data.balance > 0 ? 'Ativo' : 'Inativo'; 
          
          t.update(clientDocRef, { 
              totalInvestido: data.balance,
              status: newStatus 
          });
      });

    }); // Fim do firestore.runTransaction

    this.logger.warn('REPROCESSAMENTO DE HISTÓRICO CONCLUÍDO.');
  }

  /**
   * Verifica se uma transação de cliente recém-aprovada/criada/removida
   * afeta o histórico de lucros do fundo e, em caso afirmativo,
   * aciona o reprocessamento.
   *
   * @param transactionDate A data da transação de Aporte/Resgate.
   */
  public async triggerReprocessingIfNecessary(transactionDate: Date) {
    this.logger.log(
      `Verificando necessidade de reprocessamento para data: ${transactionDate.toISOString()}`,
    );

    // 1. Encontre a *primeira* operação de fundo que ocorreu
    //    EM OU DEPOIS desta data de transação.
    const firstOpQuery = this.firestore
      .collection(this.collectionName)
      .where('data', '>=', transactionDate)
      .orderBy('data', 'asc')
      .limit(1);

    const firstOpSnapshot = await firstOpQuery.get();

    if (firstOpSnapshot.empty) {
      // Nenhuma operação de fundo foi afetada.
      this.logger.log(
        `Nenhuma operação de fundo encontrada em ou após ${transactionDate.toISOString()}. Reprocessamento não é necessário.`,
      );
      return;
    }

    // 2. Encontramos uma operação afetada!
    //    Precisamos começar o reprocessamento a partir da data desta operação.
    const firstOpData = firstOpSnapshot.docs[0].data();
    const reprocessStartDate = (firstOpData.data as FirebaseFirestore.Timestamp).toDate();

    this.logger.log(
      `Reprocessamento necessário. A transação afeta a OpID: ${firstOpSnapshot.docs[0].id} de ${reprocessStartDate.toISOString()}`,
    );

    // 3. Chame o motor de reprocessamento (do Passo 2)
    await this.reprocessOperationsFrom(reprocessStartDate);
  }
  
  /**
   * Lógica de distribuição refatorada para rodar DENTRO de uma transação do Firestore.
   * Ela agora recebe o objeto de transação 't' como argumento.
   */
  private async distributeResultInTransaction(
    t: FirebaseFirestore.Transaction,
    resultado: number,
    dataDaOperacao: Date,
    operationId: string,
  ) {
    if (resultado === 0) return;

    this.logger.log(`[Transação] Iniciando distribuição de resultado: R$ ${resultado.toFixed(2)}`);

    // 1. LER transações DENTRO da transação 't'
    const transQuery = this.firestore.collection('client_transactions').where('status', '==', 'Aprovado');
    const transSnapshot = await t.get(transQuery);

    if (transSnapshot.empty) {
        this.logger.warn('[Transação] Nenhuma transação aprovada encontrada.');
        return;
    }

    // 2. Calcular saldos (mesma lógica de antes)
    const clientBalances = new Map<string, { balance: number, name: string }>();
    transSnapshot.docs.forEach(doc => {
        const tr = doc.data();
        if (!tr.clientId) return; // Proteção
        
        if (!clientBalances.has(tr.clientId)) {
            clientBalances.set(tr.clientId, { balance: 0, name: tr.clientName || 'Nome não encontrado' });
        }
        
        const clientData = clientBalances.get(tr.clientId)!;
        
        if (tr.tipo === 'Aporte' || tr.tipo === 'Rendimento') {
            clientData.balance += tr.valor;
        } else if (tr.tipo === 'Resgate') {
            clientData.balance -= tr.valor;
        }
        if (!clientData.name && tr.clientName) {
            clientData.name = tr.clientName;
        }
    });

    // 3. Filtrar clientes ativos e calcular patrimônio
    const activeClients = new Map<string, { balance: number, name: string }>();
    let patrimonioTotal = 0;
    clientBalances.forEach((data, clientId) => {
        if (data.balance > 0) {
            activeClients.set(clientId, data);
            patrimonioTotal += data.balance;
        }
    });

    if (activeClients.size === 0) {
        this.logger.warn('[Transação] Nenhum cliente com saldo positivo (calculado) encontrado.');
        return;
    }
    if (patrimonioTotal <= 0) {
        this.logger.warn(`[Transação] Patrimônio total (calculado) é zero ou negativo: R$ ${patrimonioTotal}.`);
        return;
    }

    // 4. Calcular rentabilidade
    const rentabilidade = resultado / patrimonioTotal;
    this.logger.log(`[Transação] Patrimônio base: R$ ${patrimonioTotal.toFixed(2)}. Rentabilidade: ${(rentabilidade * 100).toFixed(6)}%`);

    // 5. ESCREVER na transação 't' (sem batch, pois 't' já é um batch)
    activeClients.forEach((clientData, clientId) => {
        const clientDocRef = this.firestore.collection('users').doc(clientId);
        const transactionDocRef = this.firestore.collection('client_transactions').doc();

        const lucroCliente = clientData.balance * rentabilidade;
        const novoSaldo = clientData.balance + lucroCliente;
        
        // Atualiza o saldo "cache" do cliente
        t.update(clientDocRef, { totalInvestido: novoSaldo });
        
        // Cria o registro de rendimento
        t.set(transactionDocRef, {
            clientId: clientId,
            clientName: clientData.name,
            data: dataDaOperacao,
            tipo: 'Rendimento',
            valor: lucroCliente,
            status: 'Aprovado',
            operationId: operationId, // <-- ADICIONE O VÍNCULO AQUI
        });
    });


    this.logger.log(`[Transação] Resultado distribuído para ${activeClients.size} clientes.`);
  }

  // ====================================================================
  // MÉTODO CREATE (Refatorado para transação)
  // ====================================================================
  async create(createDto: CreateFundOperationDto): Promise<FundOperation> {
    
    const resultado = createDto.resultado ?? 0;
    const data = this.parseLocalDate(createDto.data);
    const newOperationRef = this.firestore.collection(this.collectionName).doc();

    const newOperation: Omit<FundOperation, 'id'> = {
      data,
      descricao: createDto.descricao ?? '',
      valorInvestido: createDto.valorInvestido ?? 0,
      valorVenda: createDto.valorVenda ?? 0,
      resultado: resultado,
    };

    // Roda a criação E a distribuição dentro de uma única transação
   await this.firestore.runTransaction(async (t) => {
        // 1. CHAMA A DISTRIBUIÇÃO PRIMEIRO (faz leituras e escritas)
        await this.distributeResultInTransaction(
            t, 
            resultado, 
            data, 
            newOperationRef.id
        );
        
        // 2. Escreve a nova operação de fundo (Escrita no final)
        t.set(newOperationRef, newOperation);
    });
    
    return { id: newOperationRef.id, ...newOperation };
  }

  // ====================================================================
  // MÉTODO UPDATE (Refatorado para transação)
  // ====================================================================
  async update(id: string, updateDto: UpdateFundOperationDto): Promise<FundOperation> {
    const docRef = this.firestore.collection(this.collectionName).doc(id);
    let existingData: FundOperation;
    let updatePayload: Partial<FundOperation> = {};
    let dataDaOperacao: Date;
    let diferencaResultado: number = 0;

    // Roda a atualização E a distribuição da diferença dentro de uma transação
    await this.firestore.runTransaction(async (t) => {
        // 1. Leitura OBRIGATÓRIA dentro da transação
        const doc = await t.get(docRef);
        if (!doc.exists) throw new NotFoundException(`Operação com ID ${id} não encontrada.`);
        
        existingData = doc.data() as FundOperation;
        
        // 2. Prepara o payload (lógica de antes)
        updatePayload = {};
        if (updateDto.data) updatePayload.data = this.parseLocalDate(updateDto.data);
        if (updateDto.descricao) updatePayload.descricao = updateDto.descricao;
        if (updateDto.valorInvestido !== undefined) updatePayload.valorInvestido = updateDto.valorInvestido;
        if (updateDto.valorVenda !== undefined) updatePayload.valorVenda = updateDto.valorVenda;
        if (updateDto.resultado !== undefined) {
            updatePayload.resultado = updateDto.resultado;
        }

        // 3. Calcula a diferença (lógica de antes)
        const novoResultado = updatePayload.resultado !== undefined 
            ? updatePayload.resultado 
            : existingData.resultado;
        
        diferencaResultado = novoResultado - existingData.resultado;
        dataDaOperacao = updatePayload.data || existingData.data;

        // 3. CHAMA A DISTRIBUIÇÃO (faz leituras e escritas)
        await this.distributeResultInTransaction(
            t, 
            diferencaResultado, 
            dataDaOperacao, 
            id
        );

        // 4. Escreve a atualização da operação (Escrita no final)
        t.update(docRef, updatePayload);
    });
    
    // Retorna os dados atualizados (a transação já foi comitada)
    return { ...existingData, ...updatePayload, id } as FundOperation;
  }

  // ====================================================================
  // MÉTODO REMOVE (Refatorado para transação)
  // ====================================================================
  async remove(id: string): Promise<void> {
    const docRef = this.firestore.collection(this.collectionName).doc(id);

    await this.firestore.runTransaction(async (t) => {
        // 1. Leitura
        const doc = await t.get(docRef);
        if (!doc.exists) {
            throw new NotFoundException(`Operação com ID ${id} não encontrada.`);
        }
        const existingData = doc.data() as FundOperation;
        
        // 2. Calcula a reversão
        const resultadoRevertido = -existingData.resultado;
        
        // 3. CHAMA A DISTRIBUIÇÃO (que faz leituras e escritas)
        //    Isso deve vir ANTES do t.delete
        await this.distributeResultInTransaction(
            t, 
            resultadoRevertido, 
            existingData.data, 
            id
        );

        // 4. Deleta a operação (Escrita no final)
        t.delete(docRef);
    });
}

async findAll(queryDto: FindAllFundOperationsDto): Promise<PaginatedFundOperationResponseDto> {
  const { 
    page = 1, 
    limit = 10, 
    // --- INÍCIO DA CORREÇÃO ---
    // 1. Reativamos 'sortBy' e 'sortOrder' com valores padrão
    sortBy = 'data',
    sortOrder = 'desc',
    // --- FIM DA CORREÇÃO ---
    startDate, 
    endDate, 
    tipo,
  } = queryDto;

  let query: FirebaseFirestore.Query = this.firestore.collection(this.collectionName);

  if (tipo) {
    query = query.where('tipo', '==', tipo);
  }
  if (startDate) {
    query = query.where('data', '>=', new Date(startDate));
  }
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    query = query.where('data', '<=', end);
  }
  
  // --- Lógica de Ordenação e Paginação (Ajustada para Firestore) ---

  // --- INÍCIO DA CORREÇÃO ---
  // 2. Removemos a lógica de .split(':')
  // const [sortByField, sortDirection] = (queryDto.sortBy || 'data:desc').split(':'); // REMOVIDO

  // 3. Usamos 'sortBy' e 'sortOrder' diretamente
  query = query.orderBy(sortBy, sortOrder as 'asc' | 'desc');
  // --- FIM DA CORREÇÃO ---


  // Adiciona uma ordenação secundária por 'data' se a principal não for 'data'
  if (sortBy !== 'data') {
    query = query.orderBy('data', 'desc');
  }

  // 2. Obter o total (com os filtros aplicados, antes da paginação)
  const totalSnapshot = await query.count().get();
  const total = totalSnapshot.data().count;

  if (total === 0) {
    return { data: [], total: 0 };
  }
  
  // 3. Aplicar paginação
  // Para a página 1, não precisamos de 'startAfter'
  if (page > 1) {
    const prevPageLimit = (page - 1) * limit;
    // Buscamos a página anterior inteira para encontrar o último documento
    const prevPageSnapshot = await query.limit(prevPageLimit).get();
    const lastDoc = prevPageSnapshot.docs[prevPageSnapshot.docs.length - 1];
    
    if (lastDoc) {
        query = query.startAfter(lastDoc);
    }
  }

  // 4. Aplicar o limite da página atual
  query = query.limit(limit);

  // 5. Obter os documentos da página atual
  const snapshot = await query.get();

  const results = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      data: data.data.toDate(),
      dataVenda: data.dataVenda ? data.dataVenda.toDate() : undefined,
    } as unknown as FundOperation;
  });

  return { data: results, total };
}
  async findOne(id: string): Promise<FundOperation> {
    const docRef = this.firestore.collection(this.collectionName).doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      throw new NotFoundException(`Operação com ID ${id} não encontrada.`);
    }
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      data: data.data.toDate()
    } as unknown as FundOperation;
  }


  // --- MÉTODO DE CÁLCULO DE PERFORMANCE ---

async getMonthlyReturns(): Promise<MonthlyReturn[]> {
  const [fundOpsResponse, clientTrans] = await Promise.all([
    this.findAll({ page: 1, limit: 9999, sortBy: 'data' }),
    this.transactionsService.findAll({})
  ]);
  const fundOps = fundOpsResponse.data;

  if (fundOps.length === 0 && clientTrans.length === 0) return [];

  const allDates = [
    ...fundOps.map((op) => op.data),
    ...clientTrans.map((t) => t.data),
  ].filter(d => d && !isNaN(d.getTime()));

  if (allDates.length === 0) return [];

  // *** mantemos fluxo, mas adicionamos aportes e resgates ***
  const monthlyData = new Map<string, { lucro: number; fluxo: number; aportes: number; resgates: number }>();

  // lucro das operações
  fundOps.forEach(op => {
    const key = `${op.data.getFullYear()}-${op.data.getMonth()}`;
    if (!monthlyData.has(key)) monthlyData.set(key, { lucro: 0, fluxo: 0, aportes: 0, resgates: 0 });
    monthlyData.get(key)!.lucro += op.resultado;
  });

  // movimentos dos clientes
  clientTrans.forEach((t) => {
    const key = `${t.data.getFullYear()}-${t.data.getMonth()}`;
    if (!monthlyData.has(key)) monthlyData.set(key, { lucro: 0, fluxo: 0, aportes: 0, resgates: 0 });

    const val = t.valor;
    if (t.tipo === 'Aporte') {
      monthlyData.get(key)!.fluxo += val;
      monthlyData.get(key)!.aportes += val;
    } else if (t.tipo === 'Resgate') {
      monthlyData.get(key)!.fluxo -= val;
      monthlyData.get(key)!.resgates += val;
    }
  });

  const monthlyReturns: MonthlyReturn[] = [];
  let patrimonioAnterior = 0;

  const firstDate = new Date(Math.min(...allDates.map((d) => d.getTime())));
  const lastDate = new Date(Math.max(...allDates.map((d) => d.getTime())));

  const currentDate = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);

  while (currentDate <= lastDate) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const key = `${year}-${month}`;

    const dataDoMes = monthlyData.get(key) || { lucro: 0, fluxo: 0, aportes: 0, resgates: 0 };

    // *** FUNDAMENTAL ***
    // base = patrimonio anterior + aportes (não desconta resgate)
    const baseDeRentabilidade = patrimonioAnterior + dataDoMes.aportes;

    let rentabilidadeMes = 0;
    if (baseDeRentabilidade > 0) {
      rentabilidadeMes = (dataDoMes.lucro / baseDeRentabilidade) * 100;
    }

    monthlyReturns.push({ year, month, returnValue: rentabilidadeMes });

    // saldo final do mês = anterior + aportes + lucro - resgates
    patrimonioAnterior = patrimonioAnterior + dataDoMes.aportes + dataDoMes.lucro - dataDoMes.resgates;

    currentDate.setMonth(currentDate.getMonth() + 1);
  }

  return monthlyReturns;
}

}