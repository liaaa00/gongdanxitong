import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class DashboardMonthQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month?: string;
}

export class DashboardScopeQueryDto extends DashboardMonthQueryDto {
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
