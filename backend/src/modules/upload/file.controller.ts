import { Controller, Get, Param, Query, Res, UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';
import { Public } from 'src/common/decorators/public.decorator';
import { UploadService } from './upload.service';

@Controller('files')
export class FileController {
  constructor(private readonly uploadService: UploadService) {}

  // 公开的带签名临时下载：供导出 Excel 内的附件超链接使用。
  // Excel 超链接由浏览器直接 GET，无法携带 Authorization 头，因此改用 URL 里的签名令牌鉴权。
  @Public()
  @Get('download')
  async downloadSigned(
    @Query('fileId') fileId: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!this.uploadService.verifyDownloadToken(fileId, Number(exp), sig)) {
      throw new UnauthorizedException('下载链接无效或已过期');
    }
    const { stream, meta } = await this.uploadService.createReadStream(fileId);
    res.setHeader('Content-Type', meta.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(meta.originalName)}"`);
    res.setHeader('Cache-Control', 'no-store');
    stream.pipe(res);
  }

  @Get(':id')
  async download(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const { stream, meta } = await this.uploadService.createReadStream(id);
    res.setHeader('Content-Type', meta.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(meta.originalName)}"`);
    res.setHeader('Cache-Control', 'no-store');
    stream.pipe(res);
  }
}
