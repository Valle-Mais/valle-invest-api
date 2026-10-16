interface PerformanceYear {
  year: number;
  items: {
    label: 'Fundo' | 'CDI';
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
  };
  chartData: {
    categories: string[];
    /** Rentabilidade acumulada em %: Minha Carteira e CDI */
    series: any[];
    /** Patrimônio em R$ ao fim de cada mês, mesmas categorias */
    seriesReais: any[];
  };
  tableData: PerformanceYear[];
}
