import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsOptional, IsUUID } from 'class-validator';

export class BatchExportDispatchedOrderDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(1000)
  @IsUUID('4', { each: true })
  ids!: string[];

  @IsOptional()
  @IsUUID('4')
  templateId?: string;

  @IsOptional()
  @IsUUID('4')
  template_id?: string;
}
