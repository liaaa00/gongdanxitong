import { ForbiddenException, Injectable } from '@nestjs/common';
import { Readable } from 'stream';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { StoredFileMeta, UploadService } from 'src/modules/upload/upload.service';

export interface RegisteredFile extends StoredFileMeta {
  ownerId: string | null;
}

@Injectable()
export class UploadsService {
  private readonly owners = new Map<string, RegisteredFile>();

  constructor(private readonly uploadService: UploadService) {}

  async save(input: {
    ownerId: string;
    kind: StoredFileMeta['kind'];
    buffer: Buffer;
    originalName: string;
    mimeType: string;
  }): Promise<RegisteredFile> {
    const meta = await this.uploadService.saveBuffer({
      kind: input.kind,
      buffer: input.buffer,
      originalName: input.originalName,
      mimeType: input.mimeType,
    });
    const registered = { ...meta, ownerId: input.ownerId };
    this.owners.set(meta.fileId, registered);
    return registered;
  }

  async resolveForUser(fileId: string, user: JwtUserPayload): Promise<RegisteredFile> {
    const known = this.owners.get(fileId);
    if (known) {
      this.assertReadable(known, user);
      return known;
    }
    const meta = await this.uploadService.resolveFile(fileId);
    const recovered = { ...meta, ownerId: null };
    this.owners.set(fileId, recovered);
    return recovered;
  }

  async createReadStreamForUser(fileId: string, user: JwtUserPayload): Promise<{ stream: Readable; meta: RegisteredFile }> {
    const meta = await this.resolveForUser(fileId, user);
    const { stream } = await this.uploadService.createReadStream(fileId);
    return { stream, meta };
  }

  toResponse(meta: RegisteredFile): Record<string, unknown> {
    return {
      fileId: meta.fileId,
      id: meta.fileId,
      fileName: meta.fileName,
      filename: meta.fileName,
      originalName: meta.originalName,
      original_name: meta.originalName,
      mimeType: meta.mimeType,
      mime_type: meta.mimeType,
      size: meta.size,
      kind: meta.kind,
      filePath: meta.filePath,
      downloadUrl: `/api/files/${meta.fileId}`,
      url: `/api/files/${meta.fileId}`,
      createdAt: new Date().toISOString(),
    };
  }

  private assertReadable(meta: RegisteredFile, user: JwtUserPayload): void {
    if (meta.ownerId === null || meta.ownerId === user.sub || user.roles.includes('admin')) {
      return;
    }
    throw new ForbiddenException('无权限访问该文件');
  }
}
