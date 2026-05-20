import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { DispatchedOrderStatus } from 'src/entities';

export class ListDispatchedOrderQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  moduleCode?: string;

  @IsOptional()
  @IsString()
  module_code?: string;

  @IsOptional()
  @IsString()
  pool?: string;

  @IsOptional()
  @IsString()
  handlerId?: string;

  @IsOptional()
  @IsString()
  handler_id?: string;

  @IsOptional()
  @IsEnum(DispatchedOrderStatus)
  status?: DispatchedOrderStatus;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeReturned?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  onlyPool?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  onlyUnclaimed?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  onlyDirty?: boolean;
}
