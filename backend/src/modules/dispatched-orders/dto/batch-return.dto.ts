import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class BatchReturnDispatchedOrderDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  ids!: string[];

  @IsString()
  @MinLength(2, { message: '批量退回原因必填' })
  @MaxLength(512)
  returnReason!: string;

  @IsOptional()
  @IsArray()
  returnedFields?: string[];
}
