import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class ImportTemplateFieldItemDto {
  @IsString()
  fieldCode!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  displayOrder?: number;

  @IsOptional()
  @IsString()
  headerAlias?: string | null;

  @IsOptional()
  @IsBoolean()
  isRequiredOverride?: boolean | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ReplaceImportTemplateFieldsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportTemplateFieldItemDto)
  fields!: ImportTemplateFieldItemDto[];
}
