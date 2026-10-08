/* eslint-disable prettier/prettier */
// src/cdi/cdi.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, map } from 'rxjs';

// Interfaces para tipagem forte, igual ao que tínhamos no frontend
interface BcbCdiItem {
  data: string;
  valor: string;
}

export interface MonthlyReturn {
  year: number;
  month: number; // 0 = Janeiro, 11 = Dezembro
  returnValue: number;
}

@Injectable()
export class CdiService {
  private readonly logger = new Logger(CdiService.name);
  private baseUrl = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados';

  constructor(private readonly httpService: HttpService) {}

  public async getMonthlyReturns(): Promise<MonthlyReturn[]> {
    this.logger.log('Buscando dados diários do CDI no Banco Central...');
    
    // Define uma data de início fixa (ex: 5 anos atrás) para garantir que temos dados suficientes.
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 5);
    const formattedDate = startDate.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const url = `${this.baseUrl}?dataInicial=${formattedDate}&formato=json`;

    try {
      // Usamos firstValueFrom para converter o Observable do HttpService em uma Promise
      const dailyData = await firstValueFrom(
        this.httpService.get<BcbCdiItem[]>(url).pipe(map((res) => res.data)),
      );

    
      // ADICIONE ESTA VERIFICAÇÃO DE SEGURANÇA
      if (!Array.isArray(dailyData)) {
          this.logger.error('Os dados recebidos não são um array! Abortando cálculo do CDI.');
          return []; // Retorna um array vazio para não quebrar o resto do sistema
      }
      
      this.logger.log(`Recebidos ${dailyData.length} registros diários do CDI.`);
      
      // Processa os dados diários para calcular os retornos mensais
      return this.calculateMonthlyReturns(dailyData);
    } catch (error) {
      this.logger.error('Falha ao buscar ou processar dados do CDI', error.stack);
      // Em caso de erro, retorna um array vazio para não quebrar a aplicação
      return [];
    }
  }

  // Esta função é exatamente a mesma que tínhamos no frontend, copiada para o backend.
  private calculateMonthlyReturns(dailyData: BcbCdiItem[]): MonthlyReturn[] {
    const monthlyGroups: { [key: string]: number[] } = {};

    dailyData.forEach((item) => {
      const [, month, year] = item.data.split('/');
      const key = `${year}-${month}`;
      const dailyValue = parseFloat(item.valor);

      if (!isNaN(dailyValue)) {
        if (!monthlyGroups[key]) {
          monthlyGroups[key] = [];
        }
        monthlyGroups[key].push(dailyValue);
      }
    });

    const monthlyReturns: MonthlyReturn[] = [];
    for (const key in monthlyGroups) {
      const dailyRates = monthlyGroups[key];
      const monthlyFactor = dailyRates.reduce((acc, rate) => acc * (1 + rate / 100), 1);
      const totalReturn = (monthlyFactor - 1) * 100;
      const [year, month] = key.split('-');

      monthlyReturns.push({
        year: parseInt(year, 10),
        month: parseInt(month, 10) - 1, // Converte para base 0 (Jan = 0)
        returnValue: totalReturn,
      });
    }
    
    this.logger.log(`Calculados ${monthlyReturns.length} registros mensais de CDI.`);
    return monthlyReturns;
  }
}