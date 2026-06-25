import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class BatchCompleteDispatchedOrderDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  ids!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  remark?: string;

  @IsOptional()
  @IsObject()
  extraData?: Record<string, unknown>;
}
