import { IsString, IsOptional, IsBoolean, IsEnum, MaxLength } from 'class-validator';
import { BusinessScope } from 'src/entities';

export class UpdateCertificateTypeDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  templateUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(BusinessScope)
  businessScope?: BusinessScope;
}
