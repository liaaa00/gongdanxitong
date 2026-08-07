import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateInServiceOrderDto } from './create-in-service-order.dto';

export class BatchCreateRenewalDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateInServiceOrderDto)
  items!: CreateInServiceOrderDto[];
}
