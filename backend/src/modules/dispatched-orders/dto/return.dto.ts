import { IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ReturnDispatchedOrderDto {
  @IsString()
  @MinLength(2)
  @MaxLength(512)
  returnReason!: string;

  @IsOptional()
  @IsArray()
  returnedFields?: string[];
}
