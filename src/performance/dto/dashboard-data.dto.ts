interface PerformanceYear {
  year: number;
  items: {
    label: 'Fundo' | 'CDI' | 'Ibovespa'; // <-- ADICIONE 'Ibovespa' AQUI
    monthlyValues: (number | null)[];
    annualTotal: number;
  }[];
}

export class DashboardDataDto {
  cardData: {
    saldoAtual: number;
    rendimentoReais: number;
    rentabilidadePercentual: number;
    percentualSobreCDI: number;
    percentualSobreIbov: number;
  };
  chartData: {
    categories: string[];
    series: any[];
  };
  tableData: PerformanceYear[];
}
