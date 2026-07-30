import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PROVINCES_27 } from 'src/common/constants/provinces';
import {
  BusinessScope,
  BusinessType,
  InServiceOrderKind,
  InServiceOrderStatus,
  ProcessType,
  RequirementType,
} from 'src/entities';

export class ListInServiceOrderQueryDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  handlerId?: string;

  @IsOptional()
  @IsEnum(InServiceOrderKind)
  orderKind?: InServiceOrderKind;

  @IsOptional()
  @IsEnum(BusinessScope)
  businessScope?: BusinessScope;

  @IsOptional()
  @IsEnum(BusinessScope)
  business_scope?: BusinessScope;

  @IsOptional()
  @IsEnum(BusinessType)
  businessType?: BusinessType;

  @IsOptional()
  @IsEnum(ProcessType)
  processType?: ProcessType;

  @IsOptional()
  @IsEnum(RequirementType)
  requirementType?: RequirementType;

  @IsOptional()
  @IsEnum(InServiceOrderStatus)
  status?: InServiceOrderStatus;

  @IsOptional()
  @IsString()
  @IsIn(['浙江', ...PROVINCES_27])
  province?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @IsOptional()
  @IsDateString()
  createdTo?: string;

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
