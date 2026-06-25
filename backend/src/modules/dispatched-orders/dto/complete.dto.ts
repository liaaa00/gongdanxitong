import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CompleteDispatchedOrderDto {
  @IsOptional()
  @IsObject()
  extraData?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  remark?: string;
}
