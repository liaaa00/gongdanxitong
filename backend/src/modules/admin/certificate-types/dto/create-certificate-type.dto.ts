import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class CreateCertificateTypeDto {
  @IsString()
  @MaxLength(100)
  name: string;

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
}
