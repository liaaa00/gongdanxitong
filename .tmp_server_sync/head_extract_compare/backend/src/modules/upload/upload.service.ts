import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, mkdirSync } from 'fs';
import { access, mkdir, readdir, stat, writeFile } from 'fs/promises';
import { dirname, extname, join, resolve } from 'path';
import { Readable } from 'stream';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

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

  // 导出 Excel 内的附件超链接由浏览器直接 GET，无法携带 Authorization 头；
  // 故对 fileId + 过期时间用 jwtSecret 做 HMAC 签名，生成带令牌的公开下载 URL。
  private signSecret(): string {
    return this.configService.get<string>('app.jwtSecret', { infer: true }) ?? 'change-me-jwt-secret';
  }

  private computeSignature(fileId: string, exp: number): string {
    return createHmac('sha256', this.signSecret()).update(`${fileId}.${exp}`).digest('hex');
  }

  // 生成带签名的临时下载 URL（默认有效期 7 天，覆盖导出文件的常规下载时间窗）。
  buildSignedDownloadUrl(baseUrl: string, fileId: string, ttlMs = 7 * 24 * 60 * 60 * 1000): string {
    const exp = Date.now() + ttlMs;
    const sig = this.computeSignature(fileId, exp);
    const base = baseUrl.replace(/\/+$/, '');
    return `${base}/api/files/download?fileId=${encodeURIComponent(fileId)}&exp=${exp}&sig=${sig}`;
  }

  // 校验临时下载令牌：过期或签名不符均判定无效。
  verifyDownloadToken(fileId: string, exp: number, sig: string): boolean {
    if (!fileId || !Number.isFinite(exp) || !sig) return false;
    if (exp < Date.now()) return false;
    const expected = this.computeSignature(fileId, exp);
    const expectedBuf = Buffer.from(expected, 'hex');
    const actualBuf = Buffer.from(sig, 'hex');
    if (expectedBuf.length !== actualBuf.length) return false;
    return timingSafeEqual(expectedBuf, actualBuf);
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
