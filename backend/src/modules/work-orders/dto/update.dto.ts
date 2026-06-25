import { IsObject, IsOptional, IsUUID } from 'class-validator';

export class UpdateWorkOrderDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsObject()
  extraData?: Record<string, unknown>;
}
