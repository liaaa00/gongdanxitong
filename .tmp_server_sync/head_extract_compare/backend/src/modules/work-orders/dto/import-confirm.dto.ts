import { IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class ImportConfirmDto {
  @IsString()
  filePath!: string;

  @IsObject()
  fieldMapping!: Record<string, string>;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  orderType?: string;

  @IsOptional()
  @IsObject()
  rawRows?: Record<string, unknown>[];
}
