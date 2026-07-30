import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DispatchedOrder,
  ExportTemplate,
  FieldConfig,
  FieldPermission,
  OperationLog,
  OrderAttachment,
  Role,
} from 'src/entities';
import { UploadModule } from 'src/modules/upload/upload.module';
import { ExportTemplatesController } from './export-templates.controller';
import { ExportTemplatesService } from './export-templates.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DispatchedOrder,
      ExportTemplate,
      FieldConfig,
      FieldPermission,
      OperationLog,
      OrderAttachment,
      Role,
    ]),
    UploadModule,
  ],
  controllers: [ExportTemplatesController],
  providers: [ExportTemplatesService],
  exports: [ExportTemplatesService],
})
export class ExportTemplatesModule {}
