import { Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { DashboardService } from './dashboard.service';
import { DashboardScopeQueryDto, LeaderTrendQueryDto, OrderTypeMatrixQueryDto } from './dto/dashboard-query.dto';

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

const LEADER_TREND_ROLES = [
  'admin',
  'business_owner',
  'biz_manager',
  'manager',
  'business_group_leader',
  'biz_leader',
  'data_entry_leader',
  'shared_team_owner',
  'shared_leader',
];

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('cards')
  cards(@Query() query: DashboardScopeQueryDto, @CurrentUser() user: JwtUserPayload) {
    return this.dashboardService.getDashboardCards(user, query.scope, query.month);
  }

  /** @Deprecated retained for compatibility; use GET /dashboard/cards. */
  @Get('salesperson')
  salesperson(@CurrentUser() user: JwtUserPayload) {
    return this.dashboardService.getSalespersonMetrics(user.sub);
  }

  /** @Deprecated retained for compatibility; use GET /dashboard/cards. */
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

  /** @Deprecated retained for compatibility; use GET /dashboard/cards. */
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
    return this.dashboardService.getOrderTypeMatrix(user, query.dimension ?? 'orderType', query.scope, query.month);
  }

  @Get('leader-trend')
  @Roles(...LEADER_TREND_ROLES)
  leaderTrend(@Query() query: LeaderTrendQueryDto, @CurrentUser() user: JwtUserPayload) {
    return this.dashboardService.getLeaderTrend(query.orderType ?? 'onboarding', user, query.moduleCode, query.scope, query.month);
  }
}
