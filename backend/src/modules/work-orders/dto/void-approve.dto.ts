import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class VoidApproveWorkOrderDto {
  @IsBoolean()
  approved!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  comment?: string;
}
