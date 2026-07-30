import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { PROVINCES_27 } from 'src/common/constants/provinces';
import {
  BusinessScope,
  BusinessType,
  InServiceOrderKind,
  ProcessType,
  RequirementType,
} from 'src/entities';

export class CreateInServiceOrderDto {
  @IsUUID()
  customerId!: string;

  @IsUUID()
  departmentId!: string;

  @IsOptional()
  @IsEnum(InServiceOrderKind)
  orderKind?: InServiceOrderKind;

  @IsOptional()
  @IsEnum(BusinessScope)
  businessScope?: BusinessScope;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  employeeName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  idCardNo?: string;

  @IsOptional()
  @IsObject()
  extraData?: Record<string, unknown>;

  @IsOptional()
  @IsDateString()
  expectedCompletionDate?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  businessReason?: string;

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
  @IsString()
  @IsIn(['浙江', ...PROVINCES_27])
  province?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  city?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  district?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  businessDescription?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  serviceFee?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  attachments?: string[];
}
