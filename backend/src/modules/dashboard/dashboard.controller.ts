import { Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { DashboardService } from './dashboard.service';
import { LeaderTrendQueryDto, OrderTypeMatrixQueryDto } from './dto/dashboard-query.dto';

const TEAM_DASHBOARD_ROLES = [
  'contract_specialist',
  'labor_contract_member',
  'contract_team',
  'contract_supervisor',
  'onboarding_specialist',
  'onboarding_resignation_member',
  'onboarding_team',
  'onboarding_supervisor',
  'data_entry_leader',
  'data_entry_team',
  'data_entry_supervisor',
  'social_insurance_specialist',
  'social_insurance_team',
  'social_insurance_supervisor',
  'social_security_team',
  'social_security_supervisor',
  'shared_leader',
  'shared_team_owner',
  'manager',
  'admin',
];

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('cards')
  cards(@CurrentUser() user: JwtUserPayload) {
    return this.dashboardService.getDashboardCards(user);
  }

  /** @Deprecated 保留 1 个版本，请使用 GET /dashboard/cards。 */
  @Get('salesperson')
  salesperson(@CurrentUser() user: JwtUserPayload) {
    return this.dashboardService.getSalespersonMetrics(user.sub);
  }

  /** @Deprecated 保留 1 个版本，请使用 GET /dashboard/cards。 */
  @Get('team/:module')
  @Roles(...TEAM_DASHBOARD_ROLES)
  team(@Param('module') moduleCode: string, @CurrentUser() user: JwtUserPayload) {
    return this.dashboardService.getTeamMetrics(moduleCode, user);
  }

  @Get('processor/:module')
  @Roles(...TEAM_DASHBOARD_ROLES)
  processor(@Param('module') moduleCode: string, @CurrentUser() user: JwtUserPayload) {
    return this.dashboardService.getTeamMetrics(moduleCode, user);
  }

  /** @Deprecated 保留 1 个版本，请使用 GET /dashboard/cards。 */
  @Get('manager')
  @Roles('manager', 'admin')
  manager(@CurrentUser() user: JwtUserPayload) {
    return this.dashboardService.getManagerMetrics(user);
  }

  @Get('admin')
  @Roles('admin')
  admin(@CurrentUser() user: JwtUserPayload) {
    return this.dashboardService.getManagerMetrics(user);
  }

  @Get('order-type-matrix')
  orderTypeMatrix(@Query() query: OrderTypeMatrixQueryDto, @CurrentUser() user: JwtUserPayload) {
    return this.dashboardService.getOrderTypeMatrix(user, query.dimension ?? 'orderType');
  }

  @Get('leader-trend')
  @Roles('business_owner', 'admin')
  leaderTrend(@Query() query: LeaderTrendQueryDto, @CurrentUser() user: JwtUserPayload) {
    return this.dashboardService.getLeaderTrend(query.orderType, user, query.moduleCode);
  }
}
