import { IsObject, IsOptional } from 'class-validator';

export class SubmitWorkOrderDto {
  @IsOptional()
  @IsObject()
  extraData?: Record<string, unknown>;
}
