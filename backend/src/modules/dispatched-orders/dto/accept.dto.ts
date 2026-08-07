import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AcceptDispatchedOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  signPlatform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  templateName?: string;
}
