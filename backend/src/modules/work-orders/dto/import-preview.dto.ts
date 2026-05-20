import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { OrderType } from 'src/entities';

export class ImportPreviewDto {
  @IsOptional()
  @IsEnum(OrderType)
  orderType?: OrderType;

  @IsArray()
  @IsString({ each: true })
  headers!: string[];
}
