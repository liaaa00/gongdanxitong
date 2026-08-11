import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsEnum, IsUUID } from 'class-validator';
import { OrderType } from 'src/entities';

export class BatchExportWorkOrderDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(1000)
  @IsUUID('4', { each: true })
  ids!: string[];

  @IsEnum(OrderType)
  orderType!: OrderType;
}
