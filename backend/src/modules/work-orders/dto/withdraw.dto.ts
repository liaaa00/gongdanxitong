import { IsOptional, IsString, MaxLength } from 'class-validator';

export class WithdrawWorkOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;
}
