import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderAttachment } from 'src/entities';
import { UploadsModule } from 'src/modules/uploads/uploads.module';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';

@Module({
  imports: [TypeOrmModule.forFeature([OrderAttachment]), MulterModule.register({}), UploadsModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
