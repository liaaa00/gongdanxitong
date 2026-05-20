import { IsObject, IsOptional, IsUUID } from 'class-validator';
import { IsEnum } from 'class-validator';
import { OrderType } from 'src/entities';

export class CreateWorkOrderDto {
  @IsEnum(OrderType)
  orderType!: OrderType;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsObject()
  extraData!: Record<string, unknown>;
}
