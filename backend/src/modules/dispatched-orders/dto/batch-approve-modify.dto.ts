import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class BatchApproveModifyDispatchedOrderDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  ids!: string[];

  @IsBoolean()
  approved!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  comment?: string;
}
