/* eslint-disable prettier/prettier */
import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { ClientTransactionsService } from 'src/client-transactions/client-transactions.service';
import { FundOperationsService, MonthlyReturn } from 'src/fund-operations/fund-operations.service';
import { CdiService } from 'src/cdi/cdi.service';
import { ClientTransaction } from 'src/client-transactions/entities/client-transaction.entity';
import { ClientsService } from 'src/clients/clients.service';
import { IbovespaService } from 'src/ibovespa/ibovespa.service';
import { monthlyReturnFromRates } from './monthly-return';

// Interface para a tabela de rentabilidade
interface PerformanceYear {
  year: number;
  items: {
    label: 'Fundo' | 'CDI' | 'Ibovespa';
    monthlyValues: (number | null)[];
    annualTotal: number;
  }[];
}

@Injectable()
export class PerformanceService {
  private readonly logger = new Logger(PerformanceService.name);
  private readonly months: string[] = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];

  constructor(
    private readonly transactionsService: ClientTransactionsService,
    private readonly cdiService: CdiService,
    private readonly fundPerformanceService: FundOperationsService,
    private readonly clientsService: ClientsService,
    private readonly ibovespaService: IbovespaService,
  ) {}

  // ====================================================================
  // MÉTODO PARA O DASHBOARD DO ADMINISTRADOR (REESCRITO E CORRIGIDO)
  // ====================================================================

  // A função buildAdminChartData foi REMOVIDA
  // A lógica foi unificada dentro de getAdminDashboardSummary

  async getAdminDashboardSummary(periodo: string) {
    this.logger.debug(`Iniciando getAdminDashboardSummary para o período: ${periodo}`);

    // 1️⃣ Buscar dados
    const [allClients, allOperationsResponse, allClientTrans, cdiReturns, ibovespaReturns] = await Promise.all([
      this.clientsService.findAll(),
      this.fundPerformanceService.findAll({ page: 1, limit: 99999 }),
      this.transactionsService.findAll({}),
      this.cdiService.getMonthlyReturns(),
      this.ibovespaService.getMonthlyReturns(),
    ]);

    const allOperations = allOperationsResponse.data;
    const transacoesAprovadas = allClientTrans.filter(t => t.status === 'Aprovado');

    const activeClients = allClients.filter(c => c.role === 'client' && c.status === 'Ativo');
    const patrimonioTotalAtual = activeClients.reduce((sum, c) => sum + (c.totalInvestido || 0), 0);
    const usuariosAtivos = activeClients.length;

    const saldoInvestido = transacoesAprovadas.reduce((sum, t) => {
      if (t.tipo === 'Aporte') return sum + t.valor;
      if (t.tipo === 'Resgate') return sum - t.valor;
      return sum;
    }, 0);
    const saldoLivre = 0;

    // 2️⃣ Determinar o primeiro aporte de qualquer cliente
    const firstClientTransaction = transacoesAprovadas
      .filter(t => t.tipo === 'Aporte')
      .sort((a, b) => a.data.getTime() - b.data.getTime())[0];

    let startDate: Date;
    const endDate = new Date();

    if (firstClientTransaction) {
      startDate = new Date(firstClientTransaction.data.getFullYear(), firstClientTransaction.data.getMonth(), 1);
    } else {
      startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    }

    // 3️⃣ Ajustar período conforme filtro do dashboard
    if (periodo !== 'Desde o início') {
      let monthsToGoBack = 12;
      if (periodo === 'Mês') monthsToGoBack = 1;
      if (periodo === '6 meses') monthsToGoBack = 6;
      const periodStart = new Date(endDate.getFullYear(), endDate.getMonth() - (monthsToGoBack - 1), 1);
      startDate = periodStart > startDate ? periodStart : startDate;
    }

    // 4️⃣ Construir mapa mensal de atividades do fundo
    const monthlyActivity = new Map<string, { lucro: number; fluxo: number; aportes: number }>();

    transacoesAprovadas.forEach(t => {
      const key = `${t.data.getFullYear()}-${t.data.getMonth()}`;
      if (!monthlyActivity.has(key)) monthlyActivity.set(key, { lucro: 0, fluxo: 0, aportes: 0 });

      if (t.tipo === 'Aporte') {
        monthlyActivity.get(key)!.fluxo += t.valor;
        monthlyActivity.get(key)!.aportes += t.valor;
      } else if (t.tipo === 'Resgate') {
        monthlyActivity.get(key)!.fluxo -= t.valor;
      } else if (t.tipo === 'Rendimento') {
        monthlyActivity.get(key)!.lucro += t.valor;
      }
    });

    // Taxas das operações por mês (Fase 1.5): a rentabilidade do mês é o produto de (1 + taxa).
    const opTaxasByMonth = new Map<string, Array<number | undefined>>();
    allOperations.forEach(op => {
      const key = `${op.data.getFullYear()}-${op.data.getMonth()}`;
      if (!opTaxasByMonth.has(key)) opTaxasByMonth.set(key, []);
      opTaxasByMonth.get(key)!.push(op.taxa);
    });

    // 5️⃣ Gerar meses relevantes
    const relevantMonths: { year: number; month: number }[] = [];
    const tempDate = new Date(startDate);
    const endSimDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

    while (tempDate <= endSimDate) {
      relevantMonths.push({ year: tempDate.getFullYear(), month: tempDate.getMonth() });
      tempDate.setMonth(tempDate.getMonth() + 1);
    }

    // 6️⃣ Mapas de benchmarks
    const cdiMap = new Map(cdiReturns.map(c => [`${c.year}-${c.month}`, c.returnValue]));
    const ibovMap = new Map(ibovespaReturns.map(i => [`${i.year}-${i.month}`, i.returnValue]));

    // 7️⃣ Reconstruir saldo inicial do período (acumulado antes do startDate)
    let patrimonioInicial = 0;
    transacoesAprovadas
      .filter(t => t.data < startDate)
      .forEach(t => {
        if (t.tipo === 'Aporte' || t.tipo === 'Rendimento') patrimonioInicial += t.valor;
        else if (t.tipo === 'Resgate') patrimonioInicial -= t.valor;
      });

    // 8️⃣ Simular rentabilidade mês a mês (Lógica TWR corrigida e unificada)
    //    (Substitui a chamada ao antigo buildAdminChartData)
    const categories = ['Início', ...relevantMonths.map(m => `${this.months[m.month]}/${m.year.toString().slice(-2)}`)];
    const fundoSeries: number[] = [0];
    const cdiSeries: number[] = [0];
    const ibovSeries: number[] = [0];

    let fundoFactor = 1; // TWR Fundo
    let cdiFactor = 1;   // TWR CDI
    let ibovFactor = 1;  // TWR Ibov

    relevantMonths.forEach(m => {
      const key = `${m.year}-${m.month}`;
      const activity = monthlyActivity.get(key) || { lucro: 0, fluxo: 0, aportes: 0 };

      // Rentabilidade do mês: produto de (1 + taxa) das operações do mês.
      // Fallback (operação sem taxa, antes do backfill): lucro / (patrimônio anterior + aportes).
      const retornoMes = monthlyReturnFromRates(opTaxasByMonth.get(key) ?? [], {
        profit: activity.lucro,
        base: patrimonioInicial + activity.aportes,
      });

      // 1. Acumular Fatores TWR
      fundoFactor *= (1 + retornoMes);
      const cdiReturn = cdiMap.get(key) ?? 0;
      cdiFactor *= (1 + cdiReturn / 100);
      const ibovReturn = ibovMap.get(key) ?? 0;
      ibovFactor *= (1 + ibovReturn / 100);

      // 2. Preencher séries do gráfico
      fundoSeries.push(parseFloat(((fundoFactor - 1) * 100).toFixed(2)));
      cdiSeries.push(parseFloat(((cdiFactor - 1) * 100).toFixed(2)));
      ibovSeries.push(parseFloat(((ibovFactor - 1) * 100).toFixed(2)));
      
      // 3. Atualizar o patrimônio para a próxima iteração
      // (Agora sim, usamos o fluxo líquido total)
      patrimonioInicial += activity.fluxo + activity.lucro;
    });

    // 9. Definir chartData
    const chartData = {
      categories,
      series: [
        { name: 'Fundo', data: fundoSeries },
        { name: 'CDI', data: cdiSeries },
        { name: 'Ibovespa', data: ibovSeries },
      ]
    };
    
    // 10. Definir rentabilidade para os KPIs
    const rentabilidadeTWR = fundoFactor - 1;

    // 🔹 Correção: soma de **todos os resultados das operações** (não apenas do período)
    const lucroReaisNoPeriodo = allOperations.reduce((sum, op) => sum + op.resultado, 0);

    // 🔹 Correção: total de operações = todas as operações do fundo
   const totalOperacoes = allOperations.filter(op => {
  return op.data >= startDate && op.data <= endDate;
}).length;


    // Total retornos benchmarks no período
    const cdiTotalReturnPeriodo = cdiFactor - 1;
    const ibovTotalReturnPeriodo = ibovFactor - 1;

    const percentualSobreCDI = cdiTotalReturnPeriodo ? rentabilidadeTWR / cdiTotalReturnPeriodo : 0;
    const percentualSobreIbov = ibovTotalReturnPeriodo ? rentabilidadeTWR / ibovTotalReturnPeriodo : 0;

    // Fluxo líquido do mês corrente: aportes menos resgates aprovados
    const monthStart = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    const fluxoLiquidoMes = transacoesAprovadas
      .filter(t => t.data >= monthStart && t.data <= endDate)
      .reduce((sum, t) => sum + (t.tipo === 'Aporte' ? t.valor : t.tipo === 'Resgate' ? -t.valor : 0), 0);
    const pendentes = allClientTrans.filter(t => t.status === 'Pendente').length;

    return {
      kpis: {
        saldoLivre,
        saldoInvestido,
        patrimonioTotal: patrimonioTotalAtual,
        lucroPercentual: rentabilidadeTWR,
        totalOperacoes,
        usuariosAtivos,
        fluxoLiquidoMes,
        pendentes,
      },
      rendimento: {
        lucroReais: lucroReaisNoPeriodo,
        lucroPercentual: rentabilidadeTWR,
        percentualSobreCDI,
        percentualSobreIbov,
      },
      chartData
    };
  }




  
  // ====================================================================
  // MÉTODO PARA O DASHBOARD DO CLIENTE (LÓGICA PRINCIPAL CORRIGIDA)
  // ====================================================================
  async getDashboardData(clientId: string, periodo: string) {
    const [
      clientTransactions,
      cdiReturnsData,
      // fundReturnsData NÃO É MAIS NECESSÁRIO
      ibovespaReturnsData,
    ] = await Promise.all([
      this.transactionsService.findAllByClientId(clientId),
      this.cdiService.getMonthlyReturns(),
      this.ibovespaService.getMonthlyReturns(),
    ]);

    // O cálculo agora usa apenas as transações do cliente,
    // e não mais a performance geral do fundo (fundReturnsData)
    return this.calculateMetrics(
      periodo,
      // fundReturnsData, // REMOVIDO
      cdiReturnsData,
      ibovespaReturnsData,
      clientTransactions,
    );
  }

  // ====================================================================
  // FUNÇÃO DE CÁLCULO PRINCIPAL (USADA PELO DASHBOARD DO CLIENTE)
  // ====================================================================
  private calculateMetrics(
    periodo: string,
    // fundReturnsData: MonthlyReturn[], // REMOVIDO
    cdiReturnsData: MonthlyReturn[],
    ibovespaReturnsData: MonthlyReturn[],
    clientTransactions: ClientTransaction[],
  ): {
    chartData: { categories: string[]; series: any[]; seriesReais: any[] };
    tableData: PerformanceYear[];
    cardData: {
      saldoAtual: number;
      rendimentoReais: number;
      rentabilidadePercentual: number;
      percentualSobreCDI: number;
      percentualSobreIbov: number;
    };
  } {
    this.logger.debug(`--- INICIANDO CÁLCULO DE PERFORMANCE (CLIENTE) PARA PERÍODO: ${periodo} ---`);
    
    if (clientTransactions.length === 0) {
      const emptyChart = { categories: [], series: [], seriesReais: [] };
      const emptyCard = { saldoAtual: 0, rendimentoReais: 0, rentabilidadePercentual: 0, percentualSobreCDI: 0, percentualSobreIbov: 0 };
      return { chartData: emptyChart, tableData: [], cardData: emptyCard };
    }

    // --- Etapa 1: Definir a Janela de Tempo ---
    const sortedTransactions = [...clientTransactions].sort((a, b) => a.data.getTime() - b.data.getTime());
    const firstTransactionDate = new Date(sortedTransactions[0].data.getFullYear(), sortedTransactions[0].data.getMonth(), 1);
    const today = new Date();
    let periodStartDate: Date;

    if (periodo === 'Desde o início') {
        periodStartDate = firstTransactionDate;
    } else {
        let monthsToGoBack = 12;
        if (periodo === 'Mês') monthsToGoBack = 1;
        if (periodo === '6 meses') monthsToGoBack = 6;
        // Ajusta para pegar o mês N-1 (ex: 6 meses = M, M-1, M-2, M-3, M-4, M-5)
        periodStartDate = new Date(today.getFullYear(), today.getMonth() - (monthsToGoBack - 1), 1);
    }

    const simulationStartDate = periodStartDate > firstTransactionDate ? periodStartDate : firstTransactionDate;
    const simulationEndDate = today;
    
    // --- Etapa 2: Preparar os mapas de performance (CORRIGIDO) ---
    // Remove fundPerformanceMap
    
    // Cria mapas de Lucro e Fluxo a partir das transações REAIS do cliente
    this.logger.debug(`Pré-processando ${clientTransactions.length} transações do cliente.`);
const clientProfitMap = new Map<string, number>(); // <'YYYY-M', total_lucro>
const clientFlowMap = new Map<string, number>();   // <'YYYY-M', total_fluxo (Aporte-Resgate)>
const clientAporteMap = new Map<string, number>(); // <-- ADICIONE ESTA LINHA
const clientTaxaMap = new Map<string, Array<number | undefined>>(); // <'YYYY-M', taxas dos rendimentos> (Fase 1.5)

clientTransactions.forEach(t => {
    const key = `${t.data.getFullYear()}-${t.data.getMonth()}`;
    
    if (t.tipo === 'Rendimento') {
        const currentProfit = clientProfitMap.get(key) || 0;
        clientProfitMap.set(key, currentProfit + t.valor);
        if (!clientTaxaMap.has(key)) clientTaxaMap.set(key, []);
        clientTaxaMap.get(key)!.push(t.taxa);
    } else if (t.tipo === 'Aporte') { // <-- MODIFIQUE ESTE BLOCO
        // Adiciona ao fluxo líquido
        const currentFlow = clientFlowMap.get(key) || 0;
        clientFlowMap.set(key, currentFlow + t.valor);
        // Adiciona ao mapa de aportes brutos
        const currentAporte = clientAporteMap.get(key) || 0;
        clientAporteMap.set(key, currentAporte + t.valor);
    } else if (t.tipo === 'Resgate') { // <-- MODIFIQUE ESTE BLOCO
        // Adiciona ao fluxo líquido
        const flow = -t.valor;
        const currentFlow = clientFlowMap.get(key) || 0;
        clientFlowMap.set(key, currentFlow + flow);
        // Resgates não são adicionados ao clientAporteMap
    }
});

    // Mapas de benchmark
    const cdiPerformanceMap = new Map<string, number>();
    cdiReturnsData.forEach(m => cdiPerformanceMap.set(`${m.year}-${m.month}`, m.returnValue));
    const ibovespaPerformanceMap = new Map<string, number>();
    ibovespaReturnsData.forEach(m => ibovespaPerformanceMap.set(`${m.year}-${m.month}`, m.returnValue));

    // --- Etapa 3: "Avanço Rápido" - Calcular o Saldo Inicial do Período (CORRIGIDO) ---
    let clientBalance = 0; // Saldo inicial do período
    let totalInvested = 0; // Capital líquido (Aportes-Resgates) inicial
    
    const preDate = new Date(firstTransactionDate);
    while (preDate < simulationStartDate) {
        const monthKey = `${preDate.getFullYear()}-${preDate.getMonth()}`;
        const previousBalance = clientBalance;
        
        const netTransactionsInMonth = clientFlowMap.get(monthKey) || 0;
        const profitForMonth = clientProfitMap.get(monthKey) || 0;

        clientBalance = previousBalance + netTransactionsInMonth + profitForMonth;
        totalInvested += netTransactionsInMonth; // Acumula o capital líquido
        
        preDate.setMonth(preDate.getMonth() + 1);
    }
    this.logger.debug(`Saldo inicial para o período '${periodo}' calculado: R$ ${clientBalance.toFixed(2)}`);
    this.logger.debug(`Capital líquido inicial para o período: R$ ${totalInvested.toFixed(2)}`);

    // --- Etapa 4: Simulação Principal (Dentro do Período Selecionado) (CORRIGIDO) ---
    const {
      relevantMonths,
      clientChartSeries,
      clientBalanceSeries,
      cdiChartSeries,
      ibovespaChartSeries,
      clientMonthlyReturns, // Mapa <'YYYY-M', rentabilidade_percentual_mes>
      finalClientBalance,
      finalTotalInvested, // Capital líquido final (desde o início)
      clientFactorPeriodo, // Fator de rentabilidade (time-weighted)
      cdiFactorPeriodo,
      ibovespaFactorPeriodo,
    } = this.simulateMonthlyPortfolio(
      simulationStartDate,
      simulationEndDate,
      // clientTransactions, // Não é mais necessário
      clientProfitMap, // NOVO
      clientFlowMap,   // NOVO
      clientAporteMap,
      clientTaxaMap,
      cdiPerformanceMap,
      ibovespaPerformanceMap,
      clientBalance, // Saldo inicial do período
      totalInvested, // Capital líquido inicial do período
    );

    // --- Etapa 5: Montar a estrutura de dados para a TABELA ---
    const tableData = this.buildPerformanceTable(relevantMonths, clientMonthlyReturns, cdiPerformanceMap, ibovespaPerformanceMap, firstTransactionDate);

    // --- Etapa 6: Montar os dados para os CARDS (LÓGICA CORRIGIDA CONFORME SOLICITAÇÃO) ---
    
    // Calcula o rendimento em Reais e o capital base DO PERÍODO
   const capitalMovimentadoNoPeriodo = finalTotalInvested - totalInvested;
const rendimentoReaisDoPeriodo = finalClientBalance - clientBalance - capitalMovimentadoNoPeriodo;

// --- INÍCIO DA ALTERAÇÃO ---
// CÁLCULO DE RENTABILIDADE SIMPLES (CONFORME SOLICITAÇÃO)
// Base = Capital Inicial + Capital APORTADO no Período




const cdiTotalReturnPeriodo = cdiFactorPeriodo - 1; //
    const ibovTotalReturnPeriodo = ibovespaFactorPeriodo - 1; //
    
    // --- INÍCIO DA ALTERAÇÃO ---
    
    // 1. Pegue a rentabilidade ACUMULADA (TWR) do fundo, que vem da simulação
    const fundoTotalReturnPeriodo = clientFactorPeriodo - 1; // (clientFactorPeriodo é 1.0188...)

    // 2. A função de cálculo da "Regra de 3" está correta (como definimos antes)
    const calculateOutperformance = (portfolioReturn: number, benchmarkReturn: number): number => {
      if (benchmarkReturn === 0) {
        if (portfolioReturn > 0) return Infinity; 
        if (portfolioReturn < 0) return -Infinity;
        return 1;
      }
      return portfolioReturn / benchmarkReturn;
    };
    
    const cardData = {
        saldoAtual: finalClientBalance,
        rendimentoReais: rendimentoReaisDoPeriodo,
        // 3. Use a TWR (Acumulada) do Fundo aqui
        rentabilidadePercentual: fundoTotalReturnPeriodo, 
        // 4. Compare TWR (Fundo) vs TWR (CDI)
        percentualSobreCDI: calculateOutperformance(fundoTotalReturnPeriodo, cdiTotalReturnPeriodo),
        percentualSobreIbov: calculateOutperformance(fundoTotalReturnPeriodo, ibovTotalReturnPeriodo),
    };

    return {
        chartData: {
            categories: ['Início', ...relevantMonths.map(m => `${this.months[m.month]}/${m.year.toString().slice(-2)}`)],
            series: [
                { name: 'Minha Carteira', data: clientChartSeries }, // O gráfico continua time-weighted
                { name: 'CDI', data: cdiChartSeries },
                { name: 'Ibovespa', data: ibovespaChartSeries },
            ],
            // Mesmo eixo de categorias, em R$ (patrimônio ao fim de cada mês)
            seriesReais: [{ name: 'Patrimônio', data: clientBalanceSeries }],
        },
        tableData: tableData.reverse(),
        cardData,
    };
  }

  // ====================================================================
  // FUNÇÕES AUXILIARES DE CÁLCULO
  // ====================================================================

  /**
   * Executa a simulação principal mês a mês para o período determinado.
   * (CORRIGIDO para usar os mapas de lucro/fluxo do cliente)
   */
 private simulateMonthlyPortfolio(
  simulationStartDate: Date,
  endDate: Date,
  clientProfitMap: Map<string, number>,
  clientFlowMap: Map<string, number>,
  clientAporteMap: Map<string, number>,
  clientTaxaMap: Map<string, Array<number | undefined>>,
  cdiMap: Map<string, number>,
  ibovMap: Map<string, number>,
  initialBalance: number,
  initialInvested: number
) {
  const relevantMonths: { year: number; month: number }[] = [];
  const currentDate = new Date(simulationStartDate);
  const endSimDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  while (currentDate <= endSimDate) {
    relevantMonths.push({ year: currentDate.getFullYear(), month: currentDate.getMonth() });
    currentDate.setMonth(currentDate.getMonth() + 1);
  }

  let clientBalance = initialBalance;
  let totalInvested = initialInvested;

  const clientChartSeries = [0];
  // Patrimônio em R$ ao fim de cada mês (ponto 0 = saldo no início do período)
  const clientBalanceSeries = [parseFloat(initialBalance.toFixed(2))];
  let cdiFactor = 1;
  const cdiChartSeries = [0];
  let ibovespaFactor = 1;
  const ibovespaChartSeries = [0];
  let clientFactor = 1;

  const clientMonthlyReturns = new Map<string, number>();

  relevantMonths.forEach((m) => {
    const monthKey = `${m.year}-${m.month}`;
    const previousBalance = clientBalance;

    const aportes = clientAporteMap.get(monthKey) || 0;
    const fluxoLiquido = clientFlowMap.get(monthKey) || 0;
    const resgates = fluxoLiquido - aportes > 0 ? 0 : -(fluxoLiquido - aportes); // dissecamos fluxo
    const profit = clientProfitMap.get(monthKey) || 0;

    // Rentabilidade do mês (Fase 1.5): produto de (1 + taxa) dos rendimentos do cliente no mês.
    // Aportes e resgates no meio do mês não alteram o número. Fallback para rendimentos
    // sem taxa (antes do backfill): lucro / (saldo anterior + aportes).
    const base = previousBalance + aportes;
    const monthlyReturnPercent = monthlyReturnFromRates(clientTaxaMap.get(monthKey) ?? [], { profit, base });

    // novo saldo = anterior + aportes + lucro - resgates
    clientBalance = previousBalance + aportes + profit - resgates;
    totalInvested += (aportes - resgates);

    clientMonthlyReturns.set(monthKey, monthlyReturnPercent * 100);

    clientFactor *= (1 + monthlyReturnPercent);
    clientChartSeries.push(parseFloat(((clientFactor - 1) * 100).toFixed(2)));
    clientBalanceSeries.push(parseFloat(clientBalance.toFixed(2)));

    const cdiReturn = cdiMap.get(monthKey) ?? 0;
    cdiFactor *= 1 + cdiReturn / 100;
    cdiChartSeries.push(parseFloat(((cdiFactor - 1) * 100).toFixed(2)));

    const ibovReturn = ibovMap.get(monthKey) ?? 0;
    ibovespaFactor *= 1 + ibovReturn / 100;
    ibovespaChartSeries.push(parseFloat(((ibovespaFactor - 1) * 100).toFixed(2)));
  });

  return {
    relevantMonths,
    clientChartSeries,
    clientBalanceSeries,
    cdiChartSeries,
    ibovespaChartSeries,
    clientMonthlyReturns,
    finalClientBalance: clientBalance,
    finalTotalInvested: totalInvested,
    clientFactorPeriodo: clientFactor,
    cdiFactorPeriodo: cdiFactor,
    ibovespaFactorPeriodo: ibovespaFactor,
  };
}


  /**
   * Constrói o objeto de dados para a tabela de rentabilidade anual.
   */
private buildPerformanceTable(
  relevantMonths: { year: number; month: number }[],
  clientMonthlyReturns: Map<string, number>,
  cdiPerformanceMap: Map<string, number>,
  ibovespaPerformanceMap: Map<string, number>,
  startDate: Date, // <<<<<<<<<<<<<< ADICIONADO
): PerformanceYear[] {

  const tableData: PerformanceYear[] = [];
  const years = [...new Set(relevantMonths.map(m => m.year))].sort();

  years.forEach((year) => {
      const yearData: PerformanceYear = { year, items: [
          { label: 'Fundo', monthlyValues: new Array(12).fill(null), annualTotal: 0 },
          { label: 'CDI', monthlyValues: new Array(12).fill(null), annualTotal: 0 },
          { label: 'Ibovespa', monthlyValues: new Array(12).fill(null), annualTotal: 0 },
      ]};

      for (let month = 0; month < 12; month++) {
          const key = `${year}-${month}`;
          const currentMonthDate = new Date(year, month, 1);

          // fundo (cliente)
          if (clientMonthlyReturns.has(key)) {
            yearData.items[0].monthlyValues[month] = clientMonthlyReturns.get(key)!;
          }

          // só mostra CDI e Ibov SE mês >= data do primeiro aporte
         if (currentMonthDate >= startDate && relevantMonths.some(m => m.year === year && m.month === month)) {
  if (cdiPerformanceMap.has(key)) {
    yearData.items[1].monthlyValues[month] = cdiPerformanceMap.get(key)!;
  }
  if (ibovespaPerformanceMap.has(key)) {
    yearData.items[2].monthlyValues[month] = ibovespaPerformanceMap.get(key)!;
  }
}
      }

      // calcular anual
      yearData.items.forEach(item => {
          const validMonths = item.monthlyValues.filter(v => v !== null) as number[];
          if (validMonths.length > 0) {
              item.annualTotal = (validMonths.reduce((acc, r) => acc * (1 + r / 100), 1) - 1) * 100;
          }
      });

      tableData.push(yearData);
  });

  return tableData;
}

  
  /**
   * Funções auxiliares que ainda podem ser usadas pelo getAdminDashboardSummary
   */
  private sumMonthlyActivity(
    startDate: Date, 
    endDate: Date, 
    monthlyActivity: Map<string, { lucro: number; fluxo: number; aportes: number }>, // <-- ADICIONE 'aportes: number'
    key: 'lucro' | 'fluxo' | 'aportes' // <-- ADICIONE 'aportes'
  ): number {
      let total = 0;
      const tempDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      const endLoopDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

    while(tempDate <= endLoopDate) {
          const monthKey = `${tempDate.getFullYear()}-${tempDate.getMonth()}`;
          total += monthlyActivity.get(monthKey)?.[key] || 0; //
          tempDate.setMonth(tempDate.getMonth() + 1);
      }
      return total;
  }
  
  private calculateBenchmarkTotalReturn(startDate: Date, endDate: Date, returns: MonthlyReturn[]): number {
    let factor = 1;
    const tempDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const endLoopDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

    while (tempDate <= endLoopDate) {
        const cdiReturn = returns.find(r => r.year === tempDate.getFullYear() && r.month === tempDate.getMonth())?.returnValue ?? 0;
        factor *= (1 + cdiReturn / 100);
        tempDate.setMonth(tempDate.getMonth() + 1);
    }
    return factor - 1;
  }
  
  private calculateBenchmarkSeries(
    baseSeries: number[],
    categories: string[], 
    cdiReturns: MonthlyReturn[],
  ): number[] {
    let firstInvestmentValue = 0;
    let firstInvestmentIndex = -1;

    for (let i = 0; i < baseSeries.length; i++) {
        if (baseSeries[i] > 0) {
            firstInvestmentValue = baseSeries[i];
            firstInvestmentIndex = i;
            break;
        }
    }

    if (firstInvestmentIndex === -1) {
        return new Array(baseSeries.length).fill(0);
    }

    const cdiSeries = new Array(firstInvestmentIndex).fill(0);
    cdiSeries.push(firstInvestmentValue);

    let cdiCurrentValue = firstInvestmentValue;
    
    for (let i = firstInvestmentIndex + 1; i < categories.length; i++) {
        const category = categories[i];
        if (!category || category === 'Início') continue;

        const [monthStr, yearStr] = category.split('/');
        const monthIndex = this.months.indexOf(monthStr.toUpperCase());
        const year = 2000 + parseInt(yearStr, 10);

        if (monthIndex !== -1 && !isNaN(year)) {
            const cdiReturn = cdiReturns.find(r => r.year === year && r.month === monthIndex)?.returnValue ?? 0;
            cdiCurrentValue *= (1 + cdiReturn / 100);
        }
        cdiSeries.push(parseFloat(cdiCurrentValue.toFixed(2)));
    }
    
    return cdiSeries;
  }
}