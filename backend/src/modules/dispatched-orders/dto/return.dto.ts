import { IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export type ReturnTargetType = 'creator' | 'module_handler' | 'supplement_handler';

export class ReturnDispatchedOrderDto {
  @IsString()
  @MinLength(2)
  @MaxLength(512)
  returnReason!: string;

  @IsOptional()
  @IsArray()
  returnedFields?: string[];

  @IsOptional()
  @IsIn(['creator', 'module_handler', 'supplement_handler'])
  returnTargetType?: ReturnTargetType;

  @IsOptional()
  @IsUUID('4')
  returnTargetId?: string;
}
