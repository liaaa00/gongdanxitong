import { Controller, Get, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { businessException } from 'src/common/exceptions/business-exception';
import { UploadService } from './upload.service';

const excelFileFilter = (_req: unknown, file: Express.Multer.File, callback: (error: Error | null, acceptFile: boolean) => void): void => {
  const isExcel = file.originalname.toLowerCase().endsWith('.xlsx') || file.originalname.toLowerCase().endsWith('.xls');
  callback(isExcel ? null : new Error('invalid_excel'), isExcel);
};

const attachmentFilter = (_req: unknown, file: Express.Multer.File, callback: (error: Error | null, acceptFile: boolean) => void): void => {
  const blocked = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.js', '.vbs', '.scr', '.com', '.jar', '.msi'];
  const lower = file.originalname.toLowerCase();
  const allowed = !blocked.some((ext) => lower.endsWith(ext));
  callback(allowed ? null : new Error('invalid_attachment'), allowed);
};

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('excel')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: excelFileFilter }))
  async uploadExcel(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) {
      throw businessException(4400, 400, 'Excel文件缺失');
    }
    const meta = await this.uploadService.saveBuffer({ kind: 'excel', buffer: file.buffer, originalName: file.originalname, mimeType: file.mimetype });
    return { fileId: meta.fileId, fileName: meta.fileName, size: meta.size, downloadUrl: `/api/files/${meta.fileId}` };
  }

  @Post('attachment')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 }, fileFilter: attachmentFilter }))
  async uploadAttachment(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) {
      throw businessException(4401, 400, '附件缺失');
    }
    const meta = await this.uploadService.saveBuffer({ kind: 'attachment', buffer: file.buffer, originalName: file.originalname, mimeType: file.mimetype });
    return { fileId: meta.fileId, fileName: meta.fileName, size: meta.size, downloadUrl: `/api/files/${meta.fileId}` };
  }

  @Get('files/:id')
  async download(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const { stream, meta } = await this.uploadService.createReadStream(id);
    res.setHeader('Content-Type', meta.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(meta.originalName)}"`);
    stream.pipe(res);
  }
}
