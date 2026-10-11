import { monthlyReturnFromRates } from './monthly-return';

describe('monthlyReturnFromRates', () => {
  it('é o produto de (1 + taxa) menos 1 quando todos os eventos têm taxa', () => {
    expect(
      monthlyReturnFromRates([0.05], { profit: 50, base: 6000 }),
    ).toBeCloseTo(0.05, 10);
    expect(
      monthlyReturnFromRates([0.1, -0.05], { profit: 0, base: 0 }),
    ).toBeCloseTo(1.1 * 0.95 - 1, 10);
  });

  it('mês sem eventos é zero', () => {
    expect(monthlyReturnFromRates([], { profit: 0, base: 5000 })).toBe(0);
  });

  it('cai na fórmula antiga quando algum evento não tem taxa', () => {
    expect(
      monthlyReturnFromRates([0.05, undefined], { profit: 50, base: 1000 }),
    ).toBe(0.05);
    expect(monthlyReturnFromRates([undefined], { profit: 50, base: 0 })).toBe(
      0,
    );
  });
});
