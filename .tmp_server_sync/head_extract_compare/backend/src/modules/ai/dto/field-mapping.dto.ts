import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsEnum, IsString, Length } from 'class-validator';
import { OrderType } from 'src/entities';

export class FieldMappingDto {
  @IsEnum(OrderType)
  orderType!: OrderType;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Length(1, 100, { each: true })
  headers!: string[];
}
