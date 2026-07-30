import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmptyObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { UpdateInServiceOrderDto } from './update-in-service-order.dto';

export class RequestMaterialChangeDto {
  @ValidateNested()
  @Type(() => UpdateInServiceOrderDto)
  @IsNotEmptyObject()
  changes!: UpdateInServiceOrderDto;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;
}

export class ReviewMaterialChangeDto {
  @IsBoolean()
  approved!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;
}
