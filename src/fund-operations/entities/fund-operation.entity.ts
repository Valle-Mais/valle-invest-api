export class FundOperation {
  id?: string;
  data: Date; // Data em que o resultado foi realizado (data da venda)
  descricao?: string;
  valorInvestido: number;
  valorVenda: number;
  resultado: number; // Calculado: valorVenda - valorInvestido
}
