import { IsIn, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
import { PROVINCES_27 } from 'src/common/constants/provinces';
import { OrderType } from 'src/entities';

export const OUT_OF_PROVINCE_ORDER_TYPES = [
  OrderType.OUT_OF_PROVINCE_INCREASE,
  OrderType.OUT_OF_PROVINCE_DECREASE,
] as const;

export class CreateOutOfProvinceOrderDto {
  @IsIn(OUT_OF_PROVINCE_ORDER_TYPES)
  orderType!: OrderType.OUT_OF_PROVINCE_INCREASE | OrderType.OUT_OF_PROVINCE_DECREASE;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsString()
  @IsIn([...PROVINCES_27])
  province!: string;

  @IsObject()
  extraData!: Record<string, unknown>;
}
