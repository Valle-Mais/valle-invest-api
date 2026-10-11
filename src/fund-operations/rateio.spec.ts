import {
  balancesAsOf,
  distribute,
  participates,
  replayOperations,
  RateioTransaction,
  sumBalances,
} from './rateio';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const tx = (
  clientId: string,
  tipo: RateioTransaction['tipo'],
  valor: number,
  data: string,
  extra: Partial<RateioTransaction> = {},
): RateioTransaction => ({
  clientId,
  clientName: clientId.toUpperCase(),
  tipo,
  valor,
  data: d(data),
  status: 'Aprovado',
  ...extra,
});

describe('rateio: participates / balancesAsOf', () => {
  const at = (iso: string) => new Date(iso);

  it('dia anterior entra, dia posterior não, independentemente da hora de registro', () => {
    const op = {
      data: d('2026-01-10'),
      registradaEm: at('2026-01-10T10:00:00Z'),
    };
    expect(
      participates(
        { data: d('2026-01-09'), efetivadaEm: at('2026-01-12T00:00:00Z') },
        op,
      ),
    ).toBe(true);
    expect(
      participates(
        { data: d('2026-01-11'), efetivadaEm: at('2026-01-01T00:00:00Z') },
        op,
      ),
    ).toBe(false);
  });

  it('mesmo dia: entra só quem foi efetivado antes de a operação ser registrada', () => {
    const op = {
      data: d('2026-01-10'),
      registradaEm: at('2026-01-10T10:00:00Z'),
    };
    expect(
      participates(
        { data: d('2026-01-10'), efetivadaEm: at('2026-01-10T09:59:59Z') },
        op,
      ),
    ).toBe(true);
    expect(
      participates(
        { data: d('2026-01-10'), efetivadaEm: at('2026-01-10T10:00:01Z') },
        op,
      ),
    ).toBe(false);
  });

  it('mesmo dia sem hora de registro: tudo do dia entra (documentos antigos)', () => {
    expect(
      participates(
        { data: d('2026-01-10') },
        { data: d('2026-01-10'), registradaEm: at('2026-01-10T10:00:00Z') },
      ),
    ).toBe(true);
    expect(
      participates(
        { data: d('2026-01-10'), efetivadaEm: at('2026-01-10T23:00:00Z') },
        { data: d('2026-01-10') },
      ),
    ).toBe(true);
  });

  it('soma só transações aprovadas que participam', () => {
    const op = {
      data: d('2026-01-10'),
      registradaEm: at('2026-01-10T15:00:00Z'),
    };
    const ledger = [
      tx('a', 'Aporte', 1000, '2026-01-05'),
      tx('a', 'Resgate', 200, '2026-01-07'),
      tx('b', 'Aporte', 500, '2026-01-10', {
        efetivadaEm: at('2026-01-10T09:00:00Z'),
      }), // antes: entra
      tx('c', 'Aporte', 900, '2026-01-10', {
        efetivadaEm: at('2026-01-10T16:00:00Z'),
      }), // depois: não
      tx('a', 'Aporte', 300, '2026-01-20'),
      tx('x', 'Aporte', 900, '2026-01-02', { status: 'Pendente' }),
    ];
    const balances = balancesAsOf(op, ledger);
    expect(balances.get('a')?.balance).toBe(800);
    expect(balances.get('b')?.balance).toBe(500);
    expect(balances.has('c')).toBe(false);
    expect(balances.has('x')).toBe(false);
  });

  it('inclui rendimentos de operações anteriores', () => {
    const ledger = [
      tx('a', 'Aporte', 1000, '2026-01-05'),
      tx('a', 'Rendimento', 50, '2026-01-10', { operationId: 'op1' }),
    ];
    expect(
      balancesAsOf({ data: d('2026-01-25') }, ledger).get('a')?.balance,
    ).toBe(1050);
    expect(sumBalances(ledger).get('a')?.balance).toBe(1050);
  });
});

describe('rateio: distribute', () => {
  it('rateia proporcionalmente e a soma dos rendimentos é exatamente o resultado', () => {
    const balances = new Map([
      ['a', { balance: 1000, name: 'A' }],
      ['b', { balance: 2000, name: 'B' }],
      ['c', { balance: 0.5, name: 'C' }],
      ['z', { balance: 0, name: 'Z' }],
    ]);
    const dist = distribute(100, balances);
    expect(dist.patrimonioBase).toBe(3000.5);
    expect(dist.shares.map((s) => s.clientId)).toEqual(['b', 'a', 'c']);
    const soma = dist.shares.reduce((s, x) => s + x.lucro, 0);
    expect(Math.round(soma * 100) / 100).toBe(100);
    expect(dist.shares.find((s) => s.clientId === 'a')!.lucro).toBeCloseTo(
      33.33,
      2,
    );
  });

  it('sem saldo positivo não distribui', () => {
    const dist = distribute(100, new Map([['a', { balance: -10, name: 'A' }]]));
    expect(dist).toEqual({ patrimonioBase: 0, taxa: 0, shares: [] });
  });

  it('resultado negativo gera rendimentos negativos', () => {
    const dist = distribute(
      -50,
      new Map([['a', { balance: 1000, name: 'A' }]]),
    );
    expect(dist.taxa).toBe(-0.05);
    expect(dist.shares[0].lucro).toBe(-50);
  });
});

describe('rateio: replayOperations', () => {
  const op = (id: string, data: string, resultado: number) => ({
    id,
    data: d(data),
    resultado,
  });

  it('cliente cadastrado depois da operação não recebe parte dela', () => {
    const ledger = [
      tx('a', 'Aporte', 1000, '2026-01-05'),
      tx('b', 'Aporte', 2000, '2026-01-20'),
    ];
    const { yields, stats } = replayOperations(
      [op('op1', '2026-01-10', 50)],
      ledger,
    );
    expect(yields).toHaveLength(1);
    expect(yields[0]).toMatchObject({
      clientId: 'a',
      valor: 50,
      taxa: 0.05,
      operationId: 'op1',
    });
    expect(stats.get('op1')).toEqual({ patrimonioBase: 1000, taxa: 0.05 });
  });

  it('mesmo dia: cliente criado depois de a operação ser registrada não entra; antes, entra', () => {
    const ledger = [
      tx('dionisio', 'Aporte', 1000, '2026-10-10', {
        efetivadaEm: new Date('2026-10-10T20:00:00Z'),
      }),
      tx('teste', 'Aporte', 500, '2026-10-10', {
        efetivadaEm: new Date('2026-10-10T22:00:00Z'),
      }),
    ];
    const op = {
      id: 'op1',
      data: d('2026-10-10'),
      resultado: 500,
      registradaEm: new Date('2026-10-10T21:00:00Z'),
    };
    const { yields, stats } = replayOperations([op], ledger);
    expect(stats.get('op1')).toEqual({ patrimonioBase: 1000, taxa: 0.5 });
    expect(yields.map((y) => [y.clientId, y.valor])).toEqual([
      ['dionisio', 500],
    ]);
  });

  it('encadeia operações: a segunda usa a base com os rendimentos da primeira', () => {
    const ledger = [
      tx('a', 'Aporte', 1000, '2026-01-05'),
      tx('b', 'Aporte', 2000, '2026-01-20'),
    ];
    const { yields, stats, finalBalances } = replayOperations(
      [op('op2', '2026-01-25', 150), op('op1', '2026-01-10', 50)], // fora de ordem de propósito
      ledger,
    );
    expect(stats.get('op1')).toEqual({ patrimonioBase: 1000, taxa: 0.05 });
    expect(stats.get('op2')!.patrimonioBase).toBe(3050);
    const op2 = yields.filter((y) => y.operationId === 'op2');
    expect(op2.find((y) => y.clientId === 'a')!.valor).toBeCloseTo(51.64, 2);
    expect(op2.find((y) => y.clientId === 'b')!.valor).toBeCloseTo(98.36, 2);
    expect(finalBalances.get('a')!.balance).toBeCloseTo(1101.64, 2);
    expect(finalBalances.get('b')!.balance).toBeCloseTo(2098.36, 2);
  });

  it('duas operações no mesmo dia: a segunda registrada vê os rendimentos da primeira', () => {
    const ledger = [tx('a', 'Aporte', 1000, '2026-01-05')];
    const first = {
      id: 'opB',
      data: d('2026-01-10'),
      resultado: 50,
      registradaEm: new Date('2026-01-10T10:00:00Z'),
    };
    const second = {
      id: 'opA',
      data: d('2026-01-10'),
      resultado: 105,
      registradaEm: new Date('2026-01-10T11:00:00Z'),
    };
    const { yields, stats } = replayOperations([second, first], ledger); // ids fora de ordem de propósito
    expect(stats.get('opB')!.patrimonioBase).toBe(1000);
    expect(stats.get('opA')!.patrimonioBase).toBe(1050);
    expect(stats.get('opA')!.taxa).toBeCloseTo(0.1, 10);
    expect(yields.map((y) => [y.operationId, y.valor])).toEqual([
      ['opB', 50],
      ['opA', 105],
    ]);
    expect(yields[0].efetivadaEm).toEqual(first.registradaEm);
  });

  it('operação com resultado zero não gera rendimentos', () => {
    const { yields, stats } = replayOperations(
      [op('op1', '2026-01-10', 0)],
      [tx('a', 'Aporte', 1000, '2026-01-05')],
    );
    expect(yields).toEqual([]);
    expect(stats.get('op1')).toEqual({ patrimonioBase: 1000, taxa: 0 });
  });
});
