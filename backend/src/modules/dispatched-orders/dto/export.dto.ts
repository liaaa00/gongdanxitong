import { IsOptional, IsUUID } from 'class-validator';

export class ExportDispatchedOrderDto {
  @IsOptional()
  @IsUUID()
  templateId?: string;
}
