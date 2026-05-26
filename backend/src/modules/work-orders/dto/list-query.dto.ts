import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { OrderType, WorkOrderStatus } from 'src/entities';

export class ListWorkOrderQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(OrderType)
  orderType?: OrderType;

  @IsOptional()
  @IsEnum(OrderType)
  order_type?: OrderType;

  @IsOptional()
  @IsEnum(WorkOrderStatus)
  status?: WorkOrderStatus;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsDateString()
  createdAfter?: string;

  @IsOptional()
  @IsDateString()
  createdBefore?: string;

  @IsOptional()
  @Type(() => Number)
  @IsUUID()
  createdBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  customerCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  employeeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  idCardNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  createdByName?: string;
}
