import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer, CustomerAssignee, FieldConfig, ImportJob, ImportTemplateField } from 'src/entities';
import { AiModule } from 'src/modules/ai/ai.module';
import { FieldsModule } from 'src/modules/admin/fields/fields.module';
import { DispatchEngineModule } from 'src/modules/dispatch-engine/dispatch-engine.module';
import { InServiceOrdersModule } from 'src/modules/in-service-orders/in-service-orders.module';
import { UploadsModule } from 'src/modules/uploads/uploads.module';
import { WorkOrderModule } from 'src/modules/work-orders/work-order.module';
import { AttachmentsModule } from 'src/modules/attachments/attachments.module';
import { ExcelParserService } from './excel-parser.service';
import { ImportErrorExcelService } from './error-excel.service';
import { ImportFieldValidationService } from './field-validation.service';
import { ImportTemplateConfigService } from './import-template-config.service';
import { ImportTemplateService } from './import-template.service';
import { ImportJobService } from './import-job.service';
import { ImportsController } from './imports.controller';
import { WorkOrderImportService } from './work-order-import.service';

@Module({
  imports: [
    AiModule,
    UploadsModule,
    WorkOrderModule,
    InServiceOrdersModule,
    DispatchEngineModule,
    FieldsModule,
    AttachmentsModule,
    TypeOrmModule.forFeature([FieldConfig, ImportTemplateField, ImportJob, Customer, CustomerAssignee]),
  ],
  controllers: [ImportsController],
  providers: [
    ExcelParserService,
    ImportFieldValidationService,
    ImportTemplateConfigService,
    ImportTemplateService,
    ImportErrorExcelService,
    ImportJobService,
    WorkOrderImportService,
  ],
  exports: [ImportTemplateConfigService, ImportTemplateService, ImportJobService, WorkOrderImportService],
})
export class ImportsModule {}
