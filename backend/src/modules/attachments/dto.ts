import { Type } from 'class-transformer';
import { IsIn, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class UploadOrderAttachmentDto {
  @IsUUID()
  work_order_id!: string;

  @IsOptional()
  @IsUUID()
  dispatched_order_id?: string;

  @IsString()
  biz_purpose!: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsObject()
  @Type(() => Object)
  metadata?: Record<string, unknown>;
}

export class ListOrderAttachmentsDto {
  @IsOptional()
  @IsUUID()
  work_order_id?: string;

  @IsOptional()
  @IsString()
  biz_purpose?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class ReviewOrderAttachmentDto {
  @IsIn(['approved', 'rejected', 'pass', 'return'])
  status!: 'approved' | 'rejected' | 'pass' | 'return';

  @IsOptional()
  @IsString()
  reject_reason?: string;
}

export class StampOrderAttachmentDto {
  @IsString()
  stamp_no!: string;
}
