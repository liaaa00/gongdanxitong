import { Allow, IsDateString, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class SupplementFieldDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  fieldCode?: string;

  @Allow()
  newValue?: unknown;

  @IsOptional()
  @IsObject()
  fields?: Record<string, unknown>;

  @IsOptional()
  @IsDateString()
  workOrderUpdatedAt?: string;
}
