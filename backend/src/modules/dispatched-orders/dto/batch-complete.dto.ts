import { ArrayNotEmpty, IsArray, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class BatchCompleteDispatchedOrderDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  ids!: string[];

  @IsString()
  @MinLength(1, { message: '批量完成备注必填' })
  @MaxLength(1024)
  remark!: string;

  @IsOptional()
  @IsObject()
  extraData?: Record<string, unknown>;
}
