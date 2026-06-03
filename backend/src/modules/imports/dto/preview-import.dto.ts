import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderType } from 'src/entities';
import { FIRST_PHASE_IMPORT_ORDER_TYPES } from '../import-permissions';

export class PreviewImportDto {
  @IsOptional()
  @IsString()
  fileId?: string;

  @IsOptional()
  @IsIn(FIRST_PHASE_IMPORT_ORDER_TYPES)
  orderType: OrderType = OrderType.ONBOARDING;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  sampleRows?: number;
}
