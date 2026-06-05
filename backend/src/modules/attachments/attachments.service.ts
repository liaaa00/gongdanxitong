import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { businessException } from 'src/common/exceptions/business-exception';
import { OrderAttachment } from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { UploadsService } from 'src/modules/uploads/uploads.service';
import {
  ListOrderAttachmentsDto,
  ReviewOrderAttachmentDto,
  StampOrderAttachmentDto,
  UploadOrderAttachmentDto,
} from './dto';

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectRepository(OrderAttachment)
    private readonly repository: Repository<OrderAttachment>,
    private readonly uploadsService: UploadsService,
  ) {}

  async upload(
    file: Express.Multer.File | undefined,
    payload: UploadOrderAttachmentDto,
    user: JwtUserPayload,
  ): Promise<Record<string, unknown>> {
    if (!file) {
      throw businessException(4500, HttpStatus.BAD_REQUEST, 'attachment file is required');
    }

    const meta = await this.uploadsService.save({
      ownerId: user.sub,
      kind: 'attachment',
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
    });

    const row = await this.repository.save(this.repository.create({
      workOrderId: payload.work_order_id,
      dispatchedOrderId: payload.dispatched_order_id ?? null,
      bizPurpose: payload.biz_purpose,
      fileId: meta.fileId,
      fileName: meta.fileName,
      originalName: meta.originalName,
      mimeType: meta.mimeType,
      filePath: meta.filePath,
      fileSize: meta.size,
      status: payload.status ?? 'uploaded',
      rejectReason: null,
      stampNo: null,
      stampedAt: null,
      receivedAt: null,
      reviewedBy: null,
      reviewedAt: null,
      metadata: payload.metadata ?? null,
    }));

    return {
      ...this.toResponse(row),
      upload: this.uploadsService.toResponse(meta),
      xAccelRedirect: `/protected/attachments/${meta.fileName}`,
    };
  }

  async list(query: ListOrderAttachmentsDto): Promise<OrderAttachment[]> {
    return this.repository.find({
      where: {
        ...(query.work_order_id ? { workOrderId: query.work_order_id } : {}),
        ...(query.biz_purpose ? { bizPurpose: query.biz_purpose } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      order: { createdAt: 'DESC' },
    });
  }

  async review(id: string, payload: ReviewOrderAttachmentDto, user: JwtUserPayload): Promise<Record<string, unknown>> {
    const row = await this.load(id);
    const approved = payload.status === 'approved' || payload.status === 'pass';
    if (!approved && !payload.reject_reason?.trim()) {
      throw businessException(4501, HttpStatus.BAD_REQUEST, 'reject_reason is required when attachment is rejected');
    }

    row.status = approved ? 'approved' : 'rejected';
    row.rejectReason = approved ? null : payload.reject_reason?.trim() ?? null;
    row.reviewedBy = user.sub;
    row.reviewedAt = new Date();
    const saved = await this.repository.save(row);
    return this.toResponse(saved);
  }

  async stamp(id: string, payload: StampOrderAttachmentDto): Promise<Record<string, unknown>> {
    const row = await this.load(id);
    row.stampNo = payload.stamp_no;
    row.stampedAt = new Date();
    row.status = 'stamped';
    const saved = await this.repository.save(row);
    return this.toResponse(saved);
  }

  async receive(id: string): Promise<Record<string, unknown>> {
    const row = await this.load(id);
    row.receivedAt = new Date();
    row.status = 'received';
    const saved = await this.repository.save(row);
    return this.toResponse(saved);
  }

  async remove(id: string, user: JwtUserPayload): Promise<{ success: boolean; id: string }> {
    const row = await this.load(id);
    await this.uploadsService.resolveForUser(row.fileId, user);
    await this.repository.delete(id);
    return { success: true, id };
  }

  private async load(id: string): Promise<OrderAttachment> {
    const row = await this.repository.findOne({ where: { id } });
    if (!row) {
      throw businessException(4504, HttpStatus.NOT_FOUND, 'attachment not found');
    }
    return row;
  }

  private toResponse(row: OrderAttachment): Record<string, unknown> {
    return {
      id: row.id,
      work_order_id: row.workOrderId,
      dispatched_order_id: row.dispatchedOrderId,
      biz_purpose: row.bizPurpose,
      file_id: row.fileId,
      file_name: row.fileName,
      original_name: row.originalName,
      mime_type: row.mimeType,
      file_path: row.filePath,
      file_size: row.fileSize,
      status: row.status,
      reject_reason: row.rejectReason,
      stamp_no: row.stampNo,
      stamped_at: row.stampedAt,
      received_at: row.receivedAt,
      reviewed_by: row.reviewedBy,
      reviewed_at: row.reviewedAt,
      metadata: row.metadata,
      download_url: `/api/files/${row.fileId}`,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    };
  }
}
