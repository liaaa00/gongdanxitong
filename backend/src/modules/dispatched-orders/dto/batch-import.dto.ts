import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsIn, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class BatchImportDispatchedOrderRowDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  orderNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  employeeIdCard?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  idCardNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  result?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  returnReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  remark?: string;

  @IsOptional()
  @IsObject()
  fields?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  raw?: Record<string, unknown>;
}

export class BatchImportDispatchedOrdersDto {
  @IsString()
  @MaxLength(64)
  moduleCode!: string;

  @IsIn(['status', 'fields'])
  mode!: 'status' | 'fields';

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  defaultRemark?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  defaultReturnReason?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BatchImportDispatchedOrderRowDto)
  rows!: BatchImportDispatchedOrderRowDto[];
}
