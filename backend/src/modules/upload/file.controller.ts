import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { UploadService } from './upload.service';

@Controller('files')
export class FileController {
  constructor(private readonly uploadService: UploadService) {}

  @Get(':id')
  async download(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const { stream, meta } = await this.uploadService.createReadStream(id);
    res.setHeader('Content-Type', meta.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(meta.originalName)}"`);
    res.setHeader('Cache-Control', 'no-store');
    stream.pipe(res);
  }
}
