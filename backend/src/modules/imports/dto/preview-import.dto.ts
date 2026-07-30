import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderType } from 'src/entities';
import { WORK_ORDER_IMPORT_ORDER_TYPES } from '../import-permissions';

export class PreviewImportDto {
  @IsOptional()
  @IsString()
  fileId?: string;

  @IsOptional()
  @IsIn(WORK_ORDER_IMPORT_ORDER_TYPES)
  orderType: OrderType = OrderType.ONBOARDING;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  sampleRows?: number;
}
