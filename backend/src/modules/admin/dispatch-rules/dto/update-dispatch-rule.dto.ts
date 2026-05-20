import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { DispatchStrategy, OrderType } from 'src/entities';
import { AstNode } from 'src/modules/dispatch/types';

export class UpdateDispatchRuleDto {
  @IsOptional()
  @IsString()
  ruleName?: string;

  @IsOptional()
  @IsEnum(OrderType)
  orderType?: OrderType;

  @IsOptional()
  @IsString()
  targetModule?: string;

  @IsOptional()
  @IsObject()
  triggerConditions?: AstNode | null;

  @IsOptional()
  @IsEnum(DispatchStrategy)
  dispatchStrategy?: DispatchStrategy;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  subModule?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  assigneeUserId?: string;

  @IsOptional()
  @IsString()
  fallbackUserId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allowManualOverride?: boolean;
}
