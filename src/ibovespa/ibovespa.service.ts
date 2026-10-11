/* eslint-disable prettier/prettier */
// src/ibovespa/ibovespa.service.ts

import { Injectable, Logger } from '@nestjs/common';
import yahooFinance from 'yahoo-finance2'; // Importa a nova biblioteca

// A interface de retorno permanece a mesma
export interface MonthlyReturn {
  year: number;
  month: number;
  returnValue: number;
}

// Interface para os dados que a biblioteca yahoo-finance2 retorna
interface YahooQuote {
    date: Date;
    close: number;
}

@Injectable()
export class IbovespaService {
  private readonly logger = new Logger(IbovespaService.name);
  private readonly ibovespaTicker = '^BVSP'; // Ticker do Ibovespa no Yahoo Finance

  constructor() {}

  private cache?: { at: number; data: MonthlyReturn[] };
  private inflight?: Promise<MonthlyReturn[]>;
  private static readonly CACHE_TTL_MS = 6 * 60 * 60 * 1000;

  /** Retornos mensais com cache de 6 horas por instância. Resultado vazio não é cacheado. */
  public async getMonthlyReturns(): Promise<MonthlyReturn[]> {
    if (this.cache && Date.now() - this.cache.at < IbovespaService.CACHE_TTL_MS) {
      return this.cache.data;
    }
    if (!this.inflight) {
      this.inflight = this.fetchMonthlyReturns()
        .then((data) => {
          if (data.length > 0) this.cache = { at: Date.now(), data };
          return data;
        })
        .finally(() => {
          this.inflight = undefined;
        });
    }
    return this.inflight;
  }

  private async fetchMonthlyReturns(): Promise<MonthlyReturn[]> {
    this.logger.log('Buscando dados diários do Ibovespa no Yahoo Finance...');
    
    // Define o período de busca para os últimos 5 anos
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

    try {
      // A chamada à API agora é feita através da biblioteca
      const dailyData = await yahooFinance.historical(this.ibovespaTicker, {
        period1: fiveYearsAgo,
        interval: '1d',
      });
      
      this.logger.log(`Recebidos ${dailyData.length} registros diários do Ibovespa.`);
      
      return this.calculateMonthlyReturns(dailyData as YahooQuote[]);
    } catch (error) {
      this.logger.error('Falha ao buscar ou processar dados do Ibovespa', error.stack);
      return []; // Retorna um array vazio em caso de erro
    }
  }

  private calculateMonthlyReturns(dailyData: YahooQuote[]): MonthlyReturn[] {
    const monthlyGroups = new Map<string, YahooQuote[]>();

    // 1. Agrupa as cotações diárias por mês
    dailyData.forEach((quote) => {
      const date = new Date(quote.date);
      const year = date.getFullYear();
      const month = date.getMonth(); // 0 = Janeiro, 11 = Dezembro
      const key = `${year}-${month}`;

      if (!monthlyGroups.has(key)) {
        monthlyGroups.set(key, []);
      }
      monthlyGroups.get(key)!.push(quote);
    });

    const monthlyReturns: MonthlyReturn[] = [];
    
    // 2. Calcula a rentabilidade para cada mês
    for (const [key, quotes] of monthlyGroups.entries()) {
      if (quotes.length < 2) continue; // Pula meses com menos de 2 dias de pregão

      // Garante que estão ordenados por data
      quotes.sort((a, b) => a.date.getTime() - b.date.getTime());

      const firstDayClose = quotes[0].close;
      const lastDayClose = quotes[quotes.length - 1].close;

      const totalReturn = ((lastDayClose / firstDayClose) - 1) * 100;
      
      const [year, month] = key.split('-');
      monthlyReturns.push({
        year: parseInt(year, 10),
        month: parseInt(month, 10),
        returnValue: totalReturn,
      });
    }

    this.logger.log(`Calculados ${monthlyReturns.length} registros mensais do Ibovespa.`);
    return monthlyReturns.sort((a,b) => a.year - b.year || a.month - b.month);
  }
}