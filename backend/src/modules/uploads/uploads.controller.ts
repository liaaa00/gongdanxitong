import { Controller, Get, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { businessException } from 'src/common/exceptions/business-exception';
import { UploadsService } from './uploads.service';

const excelFilter = (_req: unknown, file: Express.Multer.File, callback: (error: Error | null, acceptFile: boolean) => void): void => {
  const ok = file.originalname.toLowerCase().endsWith('.xlsx') || file.originalname.toLowerCase().endsWith('.xls');
  callback(ok ? null : new Error('invalid_excel'), ok);
};

const attachmentFilter = (_req: unknown, file: Express.Multer.File, callback: (error: Error | null, acceptFile: boolean) => void): void => {
  const blocked = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.js', '.vbs', '.scr', '.com', '.jar', '.msi'];
  const lower = file.originalname.toLowerCase();
  const ok = !blocked.some((suffix) => lower.endsWith(suffix));
  callback(ok ? null : new Error('invalid_attachment'), ok);
};

@Controller()
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('upload/excel')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: excelFilter }))
  async uploadExcel(@UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() user: JwtUserPayload) {
    if (!file) {
      throw businessException(4400, 400, 'Excel文件缺失');
    }
    const meta = await this.uploadsService.save({
      ownerId: user.sub,
      kind: 'excel',
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
    });
    return this.uploadsService.toResponse(meta);
  }

  @Post('upload/attachment')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 }, fileFilter: attachmentFilter }))
  async uploadAttachment(@UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() user: JwtUserPayload) {
    if (!file) {
      throw businessException(4401, 400, '附件缺失');
    }
    const meta = await this.uploadsService.save({
      ownerId: user.sub,
      kind: 'attachment',
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
    });
    return this.uploadsService.toResponse(meta);
  }

  @Get('files/:id')
  async download(@Param('id') id: string, @CurrentUser() user: JwtUserPayload, @Res() res: Response): Promise<void> {
    const { stream, meta } = await this.uploadsService.createReadStreamForUser(id, user);
    res.setHeader('Content-Type', meta.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(meta.originalName)}"`);
    res.setHeader('Cache-Control', 'no-store');
    stream.pipe(res);
  }
}
