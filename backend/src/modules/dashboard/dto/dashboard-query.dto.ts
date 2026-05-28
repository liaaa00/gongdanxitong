import { IsIn, IsOptional, IsString } from 'class-validator';

export class DashboardScopeQueryDto {
  @IsOptional()
  @IsIn(['mine', 'team'])
  scope?: 'mine' | 'team';
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
