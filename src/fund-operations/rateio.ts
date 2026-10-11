/**
 * Motor de rateio (Fase 1.5 do plano).
 *
 * Funções puras, sem Firestore, para que o cálculo seja testável e usado
 * igualmente pelo registro de operação, pelo reprocessamento e pelo preview.
 *
 * Regras:
 * - Participa de uma operação quem já estava na base quando ela foi lançada.
 *   Como as datas têm granularidade de dia, uma transação aprovada entra na base
 *   da operação quando `tx.data < op.data`, ou quando `tx.data == op.data` e a
 *   transação foi efetivada (`efetivadaEm`) antes de a operação ser registrada
 *   (`registradaEm`). Aporte retroativo (data anterior, registrado depois) entra.
 *   Cliente criado depois da operação, mesmo no mesmo dia, não entra.
 * - Duas operações no mesmo dia são processadas em ordem de registro; a segunda
 *   enxerga os rendimentos da primeira. Cada rendimento aponta para a sua
 *   operação por `operationId`.
 * - Cada rendimento guarda `taxa = resultado / patrimonioBase`, igual para todos
 *   os clientes da operação. A rentabilidade do cliente é o produto de (1 + taxa).
 * - Valores em centavos: cada rendimento é arredondado e a diferença de
 *   arredondamento vai para o maior saldo, para que a soma dos rendimentos seja
 *   exatamente o resultado da operação.
 */

export type TransactionTipo = 'Aporte' | 'Resgate' | 'Rendimento';

export interface RateioTransaction {
  clientId: string;
  clientName?: string;
  tipo: TransactionTipo;
  valor: number;
  data: Date;
  status?: string;
  operationId?: string;
  /** Momento em que passou a contar para o rateio (aprovação). Ausente: início do dia. */
  efetivadaEm?: Date;
}

export interface ClientBalance {
  balance: number;
  name: string;
}

export interface RateioOperation {
  id: string;
  data: Date;
  resultado: number;
  /** Momento em que a operação foi registrada. Ausente: fim do dia. */
  registradaEm?: Date;
}

export interface Share {
  clientId: string;
  name: string;
  saldo: number;
  lucro: number;
}

export interface Distribution {
  patrimonioBase: number;
  taxa: number;
  shares: Share[];
}

export interface YieldRecord {
  clientId: string;
  clientName: string;
  data: Date;
  tipo: 'Rendimento';
  valor: number;
  status: 'Aprovado';
  operationId: string;
  taxa: number;
  efetivadaEm?: Date;
}

export interface OperationStats {
  patrimonioBase: number;
  taxa: number;
}

export interface ReplayResult {
  yields: YieldRecord[];
  stats: Map<string, OperationStats>;
  finalBalances: Map<string, ClientBalance>;
}

export function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function isApproved(tx: RateioTransaction): boolean {
  return !tx.status || tx.status === 'Aprovado';
}

/** Soma, por cliente, as transações aprovadas que passam no filtro. */
export function sumBalances(
  transactions: RateioTransaction[],
  include: (tx: RateioTransaction) => boolean = () => true,
): Map<string, ClientBalance> {
  const balances = new Map<string, ClientBalance>();
  for (const tx of transactions) {
    if (!tx.clientId || !isApproved(tx) || !include(tx)) continue;
    const entry = balances.get(tx.clientId) ?? { balance: 0, name: '' };
    if (tx.tipo === 'Aporte' || tx.tipo === 'Rendimento')
      entry.balance += tx.valor;
    else if (tx.tipo === 'Resgate') entry.balance -= tx.valor;
    if (tx.clientName) entry.name = tx.clientName;
    balances.set(tx.clientId, entry);
  }
  return balances;
}

/** A transação já estava na base quando a operação foi registrada? */
export function participates(
  tx: Pick<RateioTransaction, 'data' | 'efetivadaEm'>,
  op: Pick<RateioOperation, 'data' | 'registradaEm'>,
): boolean {
  const txDay = tx.data.getTime();
  const opDay = op.data.getTime();
  if (txDay !== opDay) return txDay < opDay;
  // Mesmo dia: desempate pela ordem de registro. Sem registradaEm na operação,
  // tudo do dia entra; sem efetivadaEm na transação, ela entra.
  if (!op.registradaEm || !tx.efetivadaEm) return true;
  return tx.efetivadaEm.getTime() < op.registradaEm.getTime();
}

/** Saldo de cada cliente no momento em que `op` foi registrada. */
export function balancesAsOf(
  op: Pick<RateioOperation, 'data' | 'registradaEm'>,
  transactions: RateioTransaction[],
): Map<string, ClientBalance> {
  return sumBalances(transactions, (tx) => participates(tx, op));
}

/** Rateia `resultado` proporcionalmente aos saldos positivos. */
export function distribute(
  resultado: number,
  balances: Map<string, ClientBalance>,
): Distribution {
  const ativos = [...balances.entries()]
    .filter(([, c]) => c.balance > 0)
    .map(([clientId, c]) => ({ clientId, name: c.name, saldo: c.balance }))
    .sort((a, b) => b.saldo - a.saldo || a.clientId.localeCompare(b.clientId));

  const patrimonioBase = ativos.reduce((sum, c) => sum + c.saldo, 0);
  if (patrimonioBase <= 0 || ativos.length === 0) {
    return { patrimonioBase: 0, taxa: 0, shares: [] };
  }

  const taxa = resultado / patrimonioBase;
  const shares: Share[] = ativos.map((c) => ({
    clientId: c.clientId,
    name: c.name,
    saldo: round2(c.saldo),
    lucro: round2(c.saldo * taxa),
  }));

  // Diferença de arredondamento vai para o maior saldo (primeiro da lista).
  const distribuido = shares.reduce((sum, s) => sum + s.lucro, 0);
  const resto = round2(round2(resultado) - distribuido);
  if (resto !== 0) shares[0].lucro = round2(shares[0].lucro + resto);

  return { patrimonioBase: round2(patrimonioBase), taxa, shares };
}

function compareOps(a: RateioOperation, b: RateioOperation): number {
  const byDay = a.data.getTime() - b.data.getTime();
  if (byDay !== 0) return byDay;
  const ra = a.registradaEm?.getTime() ?? Number.POSITIVE_INFINITY;
  const rb = b.registradaEm?.getTime() ?? Number.POSITIVE_INFINITY;
  if (ra !== rb) return ra - rb;
  return a.id.localeCompare(b.id);
}

/**
 * Reprocessa `operations` em ordem (dia, hora de registro, id) sobre `ledger`
 * (aportes, resgates e rendimentos de operações que NÃO estão sendo
 * reprocessadas). Cada operação usa a base de quem já estava investido quando
 * ela foi registrada, incluindo os rendimentos recém-gerados pelas anteriores.
 */
export function replayOperations(
  operations: RateioOperation[],
  ledger: RateioTransaction[],
): ReplayResult {
  const sorted = [...operations].sort(compareOps);
  const working: RateioTransaction[] = [...ledger];
  const yields: YieldRecord[] = [];
  const stats = new Map<string, OperationStats>();

  for (const op of sorted) {
    const base = balancesAsOf(op, working);
    const dist = distribute(op.resultado, base);
    stats.set(op.id, { patrimonioBase: dist.patrimonioBase, taxa: dist.taxa });
    if (op.resultado === 0) continue;

    for (const share of dist.shares) {
      if (share.lucro === 0) continue;
      const record: YieldRecord = {
        clientId: share.clientId,
        clientName: share.name,
        data: op.data,
        tipo: 'Rendimento',
        valor: share.lucro,
        status: 'Aprovado',
        operationId: op.id,
        taxa: dist.taxa,
        efetivadaEm: op.registradaEm,
      };
      yields.push(record);
      working.push(record);
    }
  }

  return { yields, stats, finalBalances: sumBalances(working) };
}
