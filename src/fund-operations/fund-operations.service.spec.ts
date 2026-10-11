import { FundOperationsService } from './fund-operations.service';
import { FakeFirestore } from '../testing/fake-firestore';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function setup() {
  const db = new FakeFirestore();
  const service = new FundOperationsService(db as any, {} as any);
  const user = (id: string, name: string) =>
    db.seed('users', id, {
      name,
      role: 'client',
      status: 'Ativo',
      totalInvestido: 0,
    });
  const fluxo = (
    id: string,
    clientId: string,
    tipo: 'Aporte' | 'Resgate',
    valor: number,
    data: string,
    status = 'Aprovado',
    approvedAt?: Date,
  ) =>
    db.seed('client_transactions', id, {
      clientId,
      clientName:
        (db.read('users', clientId) as any)?.name ?? clientId.toUpperCase(),
      tipo,
      valor,
      data: d(data),
      status,
      ...(approvedAt ? { approvedAt } : {}),
    });
  const yields = (filter: (t: any) => boolean = () => true) =>
    db
      .all('client_transactions')
      .map(([id, t]) => ({ id, ...t }))
      .filter((t: any) => t.tipo === 'Rendimento' && filter(t))
      .sort(
        (a: any, b: any) =>
          a.data.getTime() - b.data.getTime() ||
          a.clientId.localeCompare(b.clientId),
      );
  const saldo = (clientId: string) =>
    (db.read('users', clientId) as any).totalInvestido;
  return { db, service, user, fluxo, yields, saldo };
}

describe('FundOperationsService (motor de rateio, Fase 1.5)', () => {
  it('cenário do produto: B cadastrado dias depois da operação não altera o rendimento de A', async () => {
    const { service, user, fluxo, yields, saldo } = setup();
    user('a', 'A');
    fluxo('t1', 'a', 'Aporte', 1000, '2026-01-05');

    const op = await service.create({
      data: '2026-01-10',
      descricao: 'Op 1',
      valorInvestido: 1000,
      valorVenda: 1050,
    } as any);
    expect(op.resultado).toBe(50);
    expect(op.taxa).toBe(0.05);
    expect(op.patrimonioBase).toBe(1000);
    expect(yields()).toHaveLength(1);
    expect(yields()[0]).toMatchObject({
      clientId: 'a',
      valor: 50,
      taxa: 0.05,
      operationId: op.id,
    });
    expect(saldo('a')).toBe(1050);

    // B entra depois, com aporte (o que ClientsService.create faz)
    user('b', 'B');
    fluxo('t2', 'b', 'Aporte', 2000, '2026-01-20');
    await service.triggerReprocessingIfNecessary(d('2026-01-20'));

    expect(yields()).toHaveLength(1);
    expect(yields()[0]).toMatchObject({ clientId: 'a', valor: 50, taxa: 0.05 });
    expect(saldo('a')).toBe(1050);

    // Operação seguinte divide entre os dois, sem mexer na primeira
    const op2 = await service.create({
      data: '2026-01-25',
      descricao: 'Op 2',
      resultado: 150,
    } as any);
    expect(op2.patrimonioBase).toBe(3050);
    const y2 = yields((t) => t.operationId === op2.id);
    expect(y2.map((y: any) => [y.clientId, y.valor])).toEqual([
      ['a', 51.64],
      ['b', 98.36],
    ]);
    expect(yields((t) => t.operationId === op.id)[0]).toMatchObject({
      valor: 50,
      taxa: 0.05,
    });
    expect(saldo('a')).toBe(1101.64);
    expect(saldo('b')).toBe(2098.36);
  });

  it('aportes de manhã e operação à tarde, no mesmo dia: todos participam', async () => {
    const { service, user, fluxo, yields, saldo } = setup();
    user('a', 'Teste');
    user('b', 'Dionisio');
    fluxo('t1', 'a', 'Aporte', 1000, '2026-10-10');
    fluxo('t2', 'b', 'Aporte', 500, '2026-10-10');

    const preview = await service.previewDistribution(500, '2026-10-10');
    expect(preview.patrimonioBase).toBe(1500);
    expect(preview.clientes.map((c) => [c.name, c.lucro])).toEqual([
      ['Teste', 333.33],
      ['Dionisio', 166.67],
    ]);

    const op = await service.create({
      data: '2026-10-10',
      descricao: 'petr4',
      resultado: 500,
    } as any);
    expect(op.patrimonioBase).toBe(1500);
    expect(op.createdAt).toBeInstanceOf(Date);
    expect(yields().map((y: any) => [y.clientId, y.valor])).toEqual([
      ['a', 333.33],
      ['b', 166.67],
    ]);
    expect(saldo('a')).toBe(1333.33);
    expect(saldo('b')).toBe(666.67);
  });

  it('relato do produto: Teste criado no mesmo dia, depois da operação, não entra nela', async () => {
    const { service, user, fluxo, yields, saldo } = setup();
    user('dionisio', 'Dionisio');
    fluxo('t1', 'dionisio', 'Aporte', 1000, '2026-10-10');

    const op = await service.create({
      data: '2026-10-10',
      descricao: 'petr4',
      resultado: 500,
    } as any);
    expect(op.taxa).toBe(0.5);
    expect(saldo('dionisio')).toBe(1500);

    // Cadastro de Teste com aporte inicial logo depois (o que ClientsService.create faz)
    user('teste', 'Teste');
    fluxo(
      't2',
      'teste',
      'Aporte',
      500,
      '2026-10-10',
      'Aprovado',
      new Date(op.createdAt!.getTime() + 1),
    );
    await service.triggerReprocessingIfNecessary(d('2026-10-10'));

    expect(yields().map((y: any) => [y.clientId, y.valor, y.taxa])).toEqual([
      ['dionisio', 500, 0.5],
    ]);
    expect(saldo('dionisio')).toBe(1500);
    expect(saldo('teste')).toBe(500);
    expect((await service.findOne(op.id)).patrimonioBase).toBe(1000);

    // Operação seguinte, no mesmo dia e registrada depois do aporte de Teste, divide entre os dois (1500 + 500)
    await new Promise((r) => setTimeout(r, 5));
    const op2 = await service.create({
      data: '2026-10-10',
      resultado: 200,
    } as any);
    expect(op2.patrimonioBase).toBe(2000);
    expect(
      yields((t) => t.operationId === op2.id).map((y: any) => [
        y.clientId,
        y.valor,
      ]),
    ).toEqual([
      ['dionisio', 150],
      ['teste', 50],
    ]);
  });

  it('documentos antigos sem approvedAt/createdAt usam o createTime do Firestore', async () => {
    const { db, service, user, fluxo, yields, saldo } = setup();
    user('dionisio', 'Dionisio');
    fluxo('t1', 'dionisio', 'Aporte', 1000, '2026-10-10'); // createTime: 2º tick
    db.seed('fund_operations', 'op1', {
      data: d('2026-10-10'),
      descricao: 'legada',
      valorInvestido: 0,
      valorVenda: 0,
      resultado: 500,
    }); // createTime: 3º tick
    user('teste', 'Teste');
    fluxo('t2', 'teste', 'Aporte', 500, '2026-10-10'); // createTime: 5º tick, depois da operação

    await service.reprocessOperationsFrom(new Date(0));

    expect(yields().map((y: any) => [y.clientId, y.valor])).toEqual([
      ['dionisio', 500],
    ]);
    expect(saldo('dionisio')).toBe(1500);
    expect(saldo('teste')).toBe(500);
    expect(db.read('fund_operations', 'op1')).toMatchObject({
      patrimonioBase: 1000,
      taxa: 0.5,
    });
  });

  it('aporte retroativo (antes da operação) reprocessa e a soma continua igual ao resultado', async () => {
    const { service, user, fluxo, yields, saldo } = setup();
    user('a', 'A');
    user('b', 'B');
    fluxo('t1', 'a', 'Aporte', 1000, '2026-01-05');
    const op = await service.create({
      data: '2026-01-10',
      resultado: 50,
    } as any);

    fluxo('t2', 'b', 'Aporte', 2000, '2026-01-08');
    await service.triggerReprocessingIfNecessary(d('2026-01-08'));

    const ys = yields();
    expect(ys.map((y: any) => [y.clientId, y.valor, y.operationId])).toEqual([
      ['a', 16.67, op.id],
      ['b', 33.33, op.id],
    ]);
    expect(ys.reduce((s: number, y: any) => s + y.valor, 0)).toBeCloseTo(50, 2);
    expect(saldo('a')).toBe(1016.67);
    expect(saldo('b')).toBe(2033.33);
    expect((await service.findOne(op.id)).patrimonioBase).toBe(3000);
  });

  it('reprocessar após editar aporte antigo dá o mesmo resultado que a ordem natural', async () => {
    const natural = setup();
    natural.user('a', 'A');
    natural.user('b', 'B');
    natural.fluxo('t1', 'a', 'Aporte', 1000, '2026-01-05');
    natural.fluxo('t2', 'b', 'Aporte', 3000, '2026-01-06');
    await natural.service.create({ data: '2026-01-10', resultado: 80 } as any);
    await natural.service.create({ data: '2026-01-15', resultado: -40 } as any);

    const edited = setup();
    edited.user('a', 'A');
    edited.user('b', 'B');
    edited.fluxo('t1', 'a', 'Aporte', 1000, '2026-01-05');
    edited.fluxo('t2', 'b', 'Aporte', 3000, '2026-01-20');
    await edited.service.create({ data: '2026-01-10', resultado: 80 } as any);
    await edited.service.create({ data: '2026-01-15', resultado: -40 } as any);
    edited.fluxo('t2', 'b', 'Aporte', 3000, '2026-01-06'); // edição da data
    await edited.service.triggerReprocessingIfNecessary(d('2026-01-06'));

    const strip = (ys: any[]) =>
      ys.map((y) => [y.clientId, y.valor, y.taxa, y.data.toISOString()]);
    expect(strip(edited.yields())).toEqual(strip(natural.yields()));
    expect(edited.saldo('a')).toBe(natural.saldo('a'));
    expect(edited.saldo('b')).toBe(natural.saldo('b'));
  });

  it('duas operações no mesmo dia não se misturam; excluir uma preserva a outra', async () => {
    const { service, user, fluxo, yields, saldo } = setup();
    user('a', 'A');
    fluxo('t1', 'a', 'Aporte', 1000, '2026-01-05');
    const op1 = await service.create({
      data: '2026-01-10',
      resultado: 50,
    } as any);
    const op2 = await service.create({
      data: '2026-01-10',
      resultado: 100,
    } as any);

    const byOp = (id: string) =>
      yields((t) => t.operationId === id).map((y: any) => y.valor);
    expect(byOp(op1.id)).toEqual([50]);
    expect(byOp(op2.id)).toEqual([100]);
    expect(saldo('a')).toBe(1150);

    await service.remove(op1.id);
    expect(yields().map((y: any) => [y.operationId, y.valor])).toEqual([
      [op2.id, 100],
    ]);
    expect(saldo('a')).toBe(1100);
    await expect(service.findOne(op1.id)).rejects.toThrow();
  });

  it('editar o resultado de uma operação refaz os rendimentos dela e das posteriores', async () => {
    const { service, user, fluxo, yields, saldo } = setup();
    user('a', 'A');
    fluxo('t1', 'a', 'Aporte', 1000, '2026-01-05');
    const op1 = await service.create({
      data: '2026-01-10',
      resultado: 50,
    } as any);
    const op2 = await service.create({
      data: '2026-01-20',
      resultado: 105,
    } as any); // 10% sobre 1050

    const updated = await service.update(op1.id, { resultado: 100 } as any);
    expect(updated.taxa).toBe(0.1);
    expect(yields().map((y: any) => [y.operationId, y.valor])).toEqual([
      [op1.id, 100],
      [op2.id, 105],
    ]);
    expect((await service.findOne(op2.id)).taxa).toBeCloseTo(105 / 1100, 10);
    expect(saldo('a')).toBe(1205);
  });

  it('rebuild (startDate na origem) apaga rendimentos legados sem operationId e grava a taxa', async () => {
    const { db, service, user, fluxo, yields, saldo } = setup();
    user('a', 'A');
    user('b', 'B');
    fluxo('t1', 'a', 'Aporte', 1000, '2026-01-05');
    fluxo('t2', 'b', 'Aporte', 2000, '2026-01-20');
    db.seed('fund_operations', 'op1', {
      data: d('2026-01-10'),
      descricao: 'Legada',
      valorInvestido: 0,
      valorVenda: 0,
      resultado: 50,
    });
    // Rendimentos do motor antigo: B recebeu parte indevida e não há operationId nem taxa
    db.seed('client_transactions', 'y1', {
      clientId: 'a',
      clientName: 'A',
      tipo: 'Rendimento',
      valor: 16.67,
      data: d('2026-01-10'),
      status: 'Aprovado',
    });
    db.seed('client_transactions', 'y2', {
      clientId: 'b',
      clientName: 'B',
      tipo: 'Rendimento',
      valor: 33.33,
      data: d('2026-01-10'),
      status: 'Aprovado',
    });

    const summary = await service.reprocessOperationsFrom(new Date(0));

    expect(summary).toMatchObject({
      operations: 1,
      deletedYields: 2,
      createdYields: 1,
    });
    expect(
      yields().map((y: any) => [y.clientId, y.valor, y.taxa, y.operationId]),
    ).toEqual([['a', 50, 0.05, 'op1']]);
    expect(saldo('a')).toBe(1050);
    expect(saldo('b')).toBe(2000);
    expect(db.read('fund_operations', 'op1')).toMatchObject({
      patrimonioBase: 1000,
      taxa: 0.05,
    });
  });

  it('preview usa a base da data informada', async () => {
    const { service, user, fluxo } = setup();
    user('a', 'A');
    user('b', 'B');
    fluxo('t1', 'a', 'Aporte', 1000, '2026-01-05');
    fluxo('t2', 'b', 'Aporte', 1000, '2026-01-20');

    const antes = await service.previewDistribution(100, '2026-01-19');
    expect(antes.patrimonioBase).toBe(1000);
    expect(antes.clientes.map((c) => c.clientId)).toEqual(['a']);

    const depois = await service.previewDistribution(100, '2026-01-20');
    expect(depois.patrimonioBase).toBe(2000);
    expect(
      depois.clientes.map((c) => [c.clientId, c.lucro, c.novoSaldo]),
    ).toEqual([
      ['a', 50, 1050],
      ['b', 50, 1050],
    ]);

    const semData = await service.previewDistribution(100);
    expect(semData.patrimonioBase).toBe(2000);
  });

  it('cliente com transações mas sem documento em users não derruba o reprocessamento', async () => {
    const { service, user, fluxo, yields } = setup();
    user('a', 'A');
    fluxo('t1', 'a', 'Aporte', 1000, '2026-01-05');
    fluxo('t2', 'ghost', 'Aporte', 1000, '2026-01-05');
    await service.create({ data: '2026-01-10', resultado: 100 } as any);
    expect(yields().map((y: any) => [y.clientId, y.valor])).toEqual([
      ['a', 50],
      ['ghost', 50],
    ]);
  });
});
