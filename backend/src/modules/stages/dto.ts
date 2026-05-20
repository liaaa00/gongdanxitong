import { Type } from 'class-transformer';
import { IsDateString, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateOrderStageDto {
  @IsUUID()
  work_order_id!: string;

  @IsOptional()
  @IsUUID()
  dispatched_order_id?: string;

  @IsString()
  stage_code!: string;

  @IsString()
  stage_name!: string;

  @IsOptional()
  @IsString()
  stage_status?: string;

  @IsOptional()
  @IsDateString()
  happened_at?: string;

  @IsOptional()
  @IsObject()
  @Type(() => Object)
  payload?: Record<string, unknown>;
}

export class ListOrderStagesDto {
  @IsOptional()
  @IsUUID()
  dispatched_order_id?: string;
}
