import { Controller, Get, Query, Param } from '@nestjs/common';
import { PerformanceService } from './performance.service';
import { DashboardDataDto } from './dto/dashboard-data.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { assertOwnership } from '../auth/ownership';

@Controller('performance')
export class PerformanceController {
  constructor(private readonly performanceService: PerformanceService) {}

  /** KPIs do fundo e performance percentual, só para o admin. */
  @Roles('admin')
  @Get('admin/summary')
  async getAdminDashboardSummary(@Query('periodo') periodo: string = 'Ano') {
    return this.performanceService.getAdminDashboardSummary(periodo);
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
    return this.performanceService.getDashboardData(clientId, periodo);
  }
}
