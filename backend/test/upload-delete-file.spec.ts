import { NotFoundException } from '@nestjs/common';
import { mkdtemp, readFile, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { UploadService } from 'src/modules/upload/upload.service';

describe('UploadService exact file removal', () => {
  it('deletes only the requested stored UUID, clears the cache, and is idempotent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'portal-cleanup-'));
    const service = new UploadService({ get: () => root } as unknown as ConfigService);
    const first = await service.saveBuffer({ kind: 'attachment', buffer: Buffer.from('first'), originalName: 'first.pdf', mimeType: 'application/pdf' });
    const second = await service.saveBuffer({ kind: 'attachment', buffer: Buffer.from('second'), originalName: 'second.pdf', mimeType: 'application/pdf' });
    try {
      await service.deleteFile(first.fileId);
      await expect(service.resolveFile(first.fileId)).rejects.toBeInstanceOf(NotFoundException);
      await expect(readFile(second.filePath, 'utf8')).resolves.toBe('second');
      await expect(service.deleteFile(first.fileId)).resolves.toBeUndefined();
      await expect(service.deleteFile('../second.pdf')).rejects.toBeInstanceOf(NotFoundException);
      await expect(readFile(second.filePath, 'utf8')).resolves.toBe('second');
    } finally {
      await service.deleteFile(first.fileId);
      await service.deleteFile(second.fileId);
      await rmdir(join(root, 'attachment'));
      await rmdir(root);
    }
  });
});
