/* eslint-disable prettier/prettier */
import {
  Controller,
  Get,
  Query,
  Param,
} from '@nestjs/common';
import { PerformanceService } from './performance.service';
import { DashboardDataDto } from './dto/dashboard-data.dto';

@Controller('performance')
export class PerformanceController {
  constructor(private readonly performanceService: PerformanceService) {}

  /**
   * Endpoint principal para o dashboard do Administrador.
   * Retorna os KPIs do fundo e a performance percentual.
   */
  @Get('admin/summary')
  async getAdminDashboardSummary(@Query('periodo') periodo: string = 'Ano') {
    // Este método agora está correto e alinhado com o serviço
    return this.performanceService.getAdminDashboardSummary(periodo);
  }

  /**
   * Endpoint principal para o dashboard do Cliente.
   * Retorna todos os dados (cards, gráfico, tabela) para um cliente específico.
   */
  @Get(':clientId')
  async getClientDashboard(
    @Param('clientId') clientId: string,
    @Query('periodo') periodo: string = 'Ano',
  ): Promise<DashboardDataDto> {
    // Este é o método novo e correto que chama 'calculateMetrics'
    return this.performanceService.getDashboardData(clientId, periodo);
  }


}