import { IsDateString, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class SupplementFieldDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  fieldCode?: string;

  newValue?: unknown;

  @IsOptional()
  @IsObject()
  fields?: Record<string, unknown>;

  @IsOptional()
  @IsDateString()
  workOrderUpdatedAt?: string;
}
