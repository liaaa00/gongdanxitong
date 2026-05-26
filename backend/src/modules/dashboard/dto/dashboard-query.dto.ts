import { IsIn, IsOptional, IsString } from 'class-validator';

export class OrderTypeMatrixQueryDto {
  @IsOptional()
  @IsIn(['orderType', 'node'])
  dimension?: 'orderType' | 'node';
}

export class LeaderTrendQueryDto {
  @IsString()
  orderType!: string;

  @IsOptional()
  @IsString()
  moduleCode?: string;
}
