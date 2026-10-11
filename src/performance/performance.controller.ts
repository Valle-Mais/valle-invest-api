import { Controller, Get, Query, Param } from '@nestjs/common';
import { PerformanceService } from './performance.service';
import { DashboardDataDto } from './dto/dashboard-data.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { assertOwnership } from '../auth/ownership';

/**
 * Períodos aceitos: enum curto do front novo (mes, 6m, ano, inicio) ou as
 * strings legadas. Tudo vira a string que o PerformanceService entende.
 */
const PERIOD_ALIASES: Record<string, string> = {
  mes: 'Mês',
  '6m': '6 meses',
  ano: 'Ano',
  inicio: 'Desde o início',
};

export function normalizePeriod(periodo?: string): string {
  if (!periodo) return 'Ano';
  return PERIOD_ALIASES[periodo.toLowerCase()] ?? periodo;
}

@Controller('performance')
export class PerformanceController {
  constructor(private readonly performanceService: PerformanceService) {}

  /** KPIs do fundo e performance percentual, só para o admin. */
  @Roles('admin')
  @Get('admin/summary')
  async getAdminDashboardSummary(@Query('periodo') periodo: string = 'Ano') {
    return this.performanceService.getAdminDashboardSummary(
      normalizePeriod(periodo),
    );
  }

  /**
   * Dashboard de um cliente (cards, gráfico, tabela).
   * Admin consulta qualquer cliente; cliente só a si mesmo.
   */
  @Get(':clientId')
  async getClientDashboard(
    @Param('clientId') clientId: string,
    @Query('periodo') periodo: string = 'Ano',
    @CurrentUser() user: AuthUser,
  ): Promise<DashboardDataDto> {
    assertOwnership(user, clientId);
    return this.performanceService.getDashboardData(
      clientId,
      normalizePeriod(periodo),
    );
  }
}
