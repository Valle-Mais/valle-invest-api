import { PerformanceService } from './performance.service';
import { ClientTransaction } from '../client-transactions/entities/client-transaction.entity';

const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

function service(transactions: ClientTransaction[]) {
  const transactionsService = {
    findAllByClientId: jest.fn().mockResolvedValue(transactions),
  };
  const none = { getMonthlyReturns: jest.fn().mockResolvedValue([]) };
  return new PerformanceService(
    transactionsService as any,
    none as any,
    {} as any,
    {} as any,
    none as any,
  );
}

const tx = (
  tipo: ClientTransaction['tipo'],
  valor: number,
  data: string,
  extra: Partial<ClientTransaction> = {},
): ClientTransaction => ({
  clientId: 'a',
  clientName: 'A',
  tipo,
  valor,
  data: d(data),
  status: 'Aprovado',
  ...extra,
});

describe('PerformanceService.getDashboardData (rentabilidade por evento, Fase 1.5)', () => {
  it('aporte no fim do mês não dilui a rentabilidade da operação do começo do mês', async () => {
    const result = await service([
      tx('Aporte', 1000, '2026-01-05'),
      tx('Rendimento', 50, '2026-01-10', { operationId: 'op1', taxa: 0.05 }),
      tx('Aporte', 5000, '2026-01-25'),
    ]).getDashboardData('a', 'Desde o início');

    expect(result.cardData.saldoAtual).toBe(6050);
    expect(result.cardData.rendimentoReais).toBeCloseTo(50, 6);
    expect(result.cardData.rentabilidadePercentual).toBeCloseTo(0.05, 10);
    expect(result.chartData.series[0].data[1]).toBe(5); // janeiro: +5,00%
    expect(result.chartData.seriesReais[0].data[1]).toBe(6050);
  });

  it('aporte num mês sem operação não altera a rentabilidade acumulada', async () => {
    const result = await service([
      tx('Aporte', 1000, '2026-01-05'),
      tx('Rendimento', 50, '2026-01-10', { operationId: 'op1', taxa: 0.05 }),
      tx('Aporte', 20000, '2026-02-15'),
    ]).getDashboardData('a', 'Desde o início');

    expect(result.cardData.rentabilidadePercentual).toBeCloseTo(0.05, 10);
    expect(result.cardData.saldoAtual).toBe(21050);
  });

  it('duas operações no mês compõem: (1+t1)(1+t2)-1', async () => {
    const result = await service([
      tx('Aporte', 1000, '2026-01-05'),
      tx('Rendimento', 100, '2026-01-10', { operationId: 'op1', taxa: 0.1 }),
      tx('Rendimento', -55, '2026-01-20', { operationId: 'op2', taxa: -0.05 }),
    ]).getDashboardData('a', 'Desde o início');

    expect(result.cardData.rentabilidadePercentual).toBeCloseTo(
      1.1 * 0.95 - 1,
      10,
    );
    expect(result.cardData.saldoAtual).toBe(1045);
  });

  it('rendimentos sem taxa (antes do backfill) usam a fórmula antiga', async () => {
    const result = await service([
      tx('Aporte', 1000, '2026-01-05'),
      tx('Rendimento', 50, '2026-01-10'),
      tx('Aporte', 5000, '2026-01-25'),
    ]).getDashboardData('a', 'Desde o início');

    expect(result.cardData.rentabilidadePercentual).toBeCloseTo(50 / 6000, 10);
  });
});
