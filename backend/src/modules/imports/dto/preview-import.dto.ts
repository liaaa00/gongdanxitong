import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderType } from 'src/entities';

export class PreviewImportDto {
  @IsOptional()
  @IsString()
  fileId?: string;

  @IsOptional()
  @IsEnum(OrderType)
  orderType: OrderType = OrderType.ONBOARDING;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  sampleRows?: number;
}
