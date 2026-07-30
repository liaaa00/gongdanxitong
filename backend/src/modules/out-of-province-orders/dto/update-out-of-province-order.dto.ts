import { IsIn, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
import { PROVINCES_27 } from 'src/common/constants/provinces';

export class UpdateOutOfProvinceOrderDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsString()
  @IsIn([...PROVINCES_27])
  province?: string;

  @IsOptional()
  @IsObject()
  extraData?: Record<string, unknown>;
}
