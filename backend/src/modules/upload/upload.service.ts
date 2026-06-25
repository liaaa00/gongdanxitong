import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, mkdirSync } from 'fs';
import { access, mkdir, readdir, stat, writeFile } from 'fs/promises';
import { dirname, extname, join, resolve } from 'path';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';

export interface StoredFileMeta {
  fileId: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  kind: 'excel' | 'attachment' | 'import' | 'import-error';
  filePath: string;
}

@Injectable()
export class UploadService implements OnModuleInit {
  private readonly logger = new Logger(UploadService.name);
  private readonly files = new Map<string, StoredFileMeta>();

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const root = this.getRootDir();
    const kinds: StoredFileMeta['kind'][] = ['excel', 'attachment', 'import', 'import-error'];
    for (const kind of kinds) {
      const dir = join(root, kind);
      try {
        mkdirSync(dir, { recursive: true });
        this.logger.log(`Ensured upload dir: ${dir}`);
      } catch (error) {
        this.logger.error(
          `Failed to create upload dir ${dir}: ${(error as Error).message}`,
          (error as Error).stack,
        );
      }
    }
  }

  getRootDir(): string {
    const configured = this.configService.get<string>('upload.dir', { infer: true }) ?? 'uploads';
    return resolve(process.cwd(), configured);
  }

  async saveBuffer(input: {
    kind: StoredFileMeta['kind'];
    buffer: Buffer;
    originalName: string;
    mimeType: string;
  }): Promise<StoredFileMeta> {
    const fileId = randomUUID();
    const ext = extname(input.originalName).toLowerCase() || this.defaultExtension(input.kind);
    const fileName = `${fileId}${ext}`;
    const filePath = join(this.getRootDir(), input.kind, fileName);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, input.buffer);
    const meta: StoredFileMeta = {
      fileId,
      fileName,
      originalName: input.originalName,
      mimeType: input.mimeType,
      size: input.buffer.length,
      kind: input.kind,
      filePath,
    };
    this.files.set(fileId, meta);
    return meta;
  }

  async resolveFile(fileId: string): Promise<StoredFileMeta> {
    const cached = this.files.get(fileId);
    if (cached) {
      return cached;
    }

    const root = this.getRootDir();
    const dirs = ['excel', 'attachment', 'import', 'import-error'];
    for (const dir of dirs) {
      const found = await this.findFileByPrefix(join(root, dir), fileId);
      if (found) {
        const fileStat = await stat(found);
        const originalName = found.split(/[\\/]/).pop() ?? fileId;
        const meta: StoredFileMeta = {
          fileId,
          fileName: originalName,
          originalName,
          mimeType: this.inferMimeType(found),
          size: fileStat.size,
          kind: this.resolveKind(found),
          filePath: found,
        };
        this.files.set(fileId, meta);
        return meta;
      }
    }

    throw new Error(`File ${fileId} not found`);
  }

  createReadStream(fileId: string): Promise<{ stream: Readable; meta: StoredFileMeta }> {
    return this.resolveFile(fileId).then((meta) => ({ stream: createReadStream(meta.filePath), meta }));
  }

  private defaultExtension(kind: StoredFileMeta['kind']): string {
    if (kind === 'attachment') {
      return '.bin';
    }
    return '.xlsx';
  }

  private async findFileByPrefix(baseDir: string, fileId: string): Promise<string | null> {
    for (const extension of ['', '.xlsx', '.xls', '.pdf', '.png', '.jpg', '.jpeg', '.bin']) {
      const candidate = join(baseDir, `${fileId}${extension}`);
      if (await this.exists(candidate)) {
        return candidate;
      }
    }

    try {
      const entries = await readdir(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(baseDir, entry.name);
        if (entry.isDirectory()) {
          const nested = await this.findFileByPrefix(fullPath, fileId);
          if (nested) {
            return nested;
          }
          continue;
        }
        if (entry.name === fileId || entry.name.startsWith(`${fileId}.`)) {
          return fullPath;
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private inferMimeType(filePath: string): string {
    const ext = extname(filePath).toLowerCase();
    if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (ext === '.xls') return 'application/vnd.ms-excel';
    if (ext === '.pdf') return 'application/pdf';
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    return 'application/octet-stream';
  }

  private resolveKind(filePath: string): StoredFileMeta['kind'] {
    if (filePath.includes(`${join('uploads', 'attachment')}`)) return 'attachment';
    if (filePath.includes(`${join('uploads', 'import-error')}`)) return 'import-error';
    if (filePath.includes(`${join('uploads', 'import')}`)) return 'import';
    return 'excel';
  }
}
