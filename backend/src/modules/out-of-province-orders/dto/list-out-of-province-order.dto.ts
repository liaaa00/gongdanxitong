import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PROVINCES_27 } from 'src/common/constants/provinces';
import { OrderType, WorkOrderStatus } from 'src/entities';
import { OUT_OF_PROVINCE_ORDER_TYPES } from './create-out-of-province-order.dto';

export class ListOutOfProvinceOrderQueryDto {
  @IsOptional()
  @IsIn(OUT_OF_PROVINCE_ORDER_TYPES)
  orderType?: OrderType.OUT_OF_PROVINCE_INCREASE | OrderType.OUT_OF_PROVINCE_DECREASE;

  @IsOptional()
  @IsIn(Object.values(WorkOrderStatus))
  status?: WorkOrderStatus;

  @IsOptional()
  @IsString()
  @IsIn([...PROVINCES_27])
  province?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize = 20;
}
