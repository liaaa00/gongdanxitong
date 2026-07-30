import { Body, Controller, Delete, Get, Param, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { AttachmentsService } from './attachments.service';
import {
  ListOrderAttachmentsDto,
  ReviewOrderAttachmentDto,
  UploadOrderAttachmentDto,
} from './dto';

const attachmentFilter = (_req: unknown, file: Express.Multer.File, callback: (error: Error | null, acceptFile: boolean) => void): void => {
  const blocked = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.js', '.vbs', '.scr', '.com', '.jar', '.msi'];
  const lower = file.originalname.toLowerCase();
  const ok = !blocked.some((suffix) => lower.endsWith(suffix));
  callback(ok ? null : new Error('invalid_attachment'), ok);
};

@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly service: AttachmentsService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 }, fileFilter: attachmentFilter }))
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() payload: UploadOrderAttachmentDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.upload(file, payload, user);
  }

  @Get()
  list(@Query() query: ListOrderAttachmentsDto) {
    return this.service.list(query);
  }

  @Post(':id/review')
  review(
    @Param('id') id: string,
    @Body() payload: ReviewOrderAttachmentDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.review(id, payload, user);
  }

  @Post(':id/receive')
  receive(@Param('id') id: string) {
    return this.service.receive(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUserPayload) {
    return this.service.remove(id, user);
  }
}
