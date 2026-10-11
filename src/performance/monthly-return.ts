/**
 * Rentabilidade de um mês a partir das taxas dos eventos (rendimentos do cliente
 * ou operações do fundo) ocorridos nele: produto de (1 + taxa) menos 1.
 *
 * É a rentabilidade ponderada pelo tempo (TWR): não depende de quando o dinheiro
 * entrou ou saiu no mês, então um aporte no dia 25 não dilui o ganho do dia 5.
 *
 * Fallback: se algum evento do mês ainda não tem `taxa` (dados anteriores ao
 * backfill `seed -- --task=rebuild-yields`), usa a fórmula antiga
 * `lucro / (saldo anterior + aportes do mês)`.
 */
export function monthlyReturnFromRates(
  taxas: Array<number | null | undefined>,
  fallback: { profit: number; base: number },
): number {
  const allRated =
    taxas.length > 0 &&
    taxas.every((t) => typeof t === 'number' && Number.isFinite(t));
  if (allRated) {
    return (taxas as number[]).reduce((factor, t) => factor * (1 + t), 1) - 1;
  }
  return fallback.base > 0 ? fallback.profit / fallback.base : 0;
}
