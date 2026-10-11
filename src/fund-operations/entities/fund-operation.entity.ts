export class FundOperation {
  id?: string;
  data: Date; // Data em que o resultado foi realizado (data da venda)
  descricao?: string;
  valorInvestido: number;
  valorVenda: number;
  resultado: number; // Calculado: valorVenda - valorInvestido
  /** Patrimônio dos clientes na véspera da operação, base do rateio (Fase 1.5). */
  patrimonioBase?: number;
  /** resultado / patrimonioBase. Mesma taxa gravada em cada rendimento. */
  taxa?: number;
  /** Momento do registro. Desempata o rateio com transações do mesmo dia (ver rateio.ts). */
  createdAt?: Date;
}
