import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsEnum, IsIn, IsObject, IsOptional, IsString, Length, ValidateNested } from 'class-validator';
import { FieldType, OrderType } from 'src/entities';
import { FIRST_PHASE_IMPORT_ORDER_TYPES } from '../import-permissions';

export class ConfirmMappingItemDto {
  @IsString()
  @Length(1, 100)
  header!: string;

  @IsString()
  @Length(1, 64)
  fieldCode!: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  defaultValue?: string;
}

export class ConfirmNewFieldDto {
  @IsString()
  @Length(1, 100)
  header!: string;

  @IsString()
  @Length(1, 100)
  fieldName!: string;

  @IsEnum(FieldType)
  fieldType!: FieldType;

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export class ConfirmImportDto {
  @IsOptional()
  @IsString()
  fileId?: string;

  @IsOptional()
  @IsIn(FIRST_PHASE_IMPORT_ORDER_TYPES)
  orderType: OrderType = OrderType.ONBOARDING;

  @IsOptional()
  @IsObject()
  mapping?: Record<string, string>;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ConfirmMappingItemDto)
  finalMapping?: ConfirmMappingItemDto[];

  @IsOptional()
  @IsBoolean()
  autoSubmit: boolean = true;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  jobName?: string;

  @IsOptional()
  @IsObject()
  defaults?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ConfirmNewFieldDto)
  newFields?: ConfirmNewFieldDto[];
}
