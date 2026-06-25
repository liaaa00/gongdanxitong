import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { UploadService } from 'src/modules/upload/upload.service';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  imports: [MulterModule.register({})],
  controllers: [UploadsController],
  providers: [UploadService, UploadsService],
  exports: [UploadService, UploadsService],
})
export class UploadsModule {}
