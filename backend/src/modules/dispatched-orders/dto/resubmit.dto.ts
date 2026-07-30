import { Transform } from 'class-transformer';
import { IsISO8601, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

function trimOptionalText(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export class ResubmitDispatchedOrderDto {
  @IsOptional()
  @IsObject()
  extraData?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  fields?: Record<string, unknown>;

  @IsOptional()
  @Transform(({ value }) => trimOptionalText(value))
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  moduleCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  module_code?: string;

  @IsOptional()
  @IsISO8601()
  workOrderUpdatedAt?: string;
}
