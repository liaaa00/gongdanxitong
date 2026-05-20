import { Controller, Get, Param } from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { DashboardService } from './dashboard.service';

const TEAM_DASHBOARD_ROLES = [
  'contract_team',
  'onboarding_team',
  'data_entry_team',
  'contract_supervisor',
  'onboarding_supervisor',
  'data_entry_supervisor',
  'manager',
  'admin',
];

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('salesperson')
  @Roles('salesperson', 'manager', 'admin')
  salesperson(@CurrentUser() user: JwtUserPayload) {
    return this.dashboardService.getSalespersonMetrics(user.sub);
  }

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
}
