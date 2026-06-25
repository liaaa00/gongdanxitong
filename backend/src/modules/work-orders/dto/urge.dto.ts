import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UrgeWorkOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  moduleCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  module_code?: string;
}
