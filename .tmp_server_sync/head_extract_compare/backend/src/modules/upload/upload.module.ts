import { Module } from '@nestjs/common';
import { FileController } from './file.controller';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

@Module({
  controllers: [UploadController, FileController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
