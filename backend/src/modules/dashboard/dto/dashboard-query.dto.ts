import { IsIn, IsOptional, IsString } from 'class-validator';

export type DashboardResolvedScope = 'mine' | 'team';
export type DashboardQueryScope = DashboardResolvedScope | 'global' | 'backend_module';

export class DashboardScopeQueryDto {
  @IsOptional()
  @IsString()
  scope?: DashboardQueryScope | string;
}

export class OrderTypeMatrixQueryDto extends DashboardScopeQueryDto {
  @IsOptional()
  @IsIn(['orderType', 'node'])
  dimension?: 'orderType' | 'node';
}

export class LeaderTrendQueryDto extends DashboardScopeQueryDto {
  @IsOptional()
  @IsString()
  orderType?: string;

  @IsOptional()
  @IsString()
  moduleCode?: string;
}
