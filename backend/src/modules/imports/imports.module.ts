import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer, CustomerAssignee, FieldConfig, ImportJob } from 'src/entities';
import { AiModule } from 'src/modules/ai/ai.module';
import { FieldsModule } from 'src/modules/admin/fields/fields.module';
import { DispatchEngineModule } from 'src/modules/dispatch-engine/dispatch-engine.module';
import { UploadsModule } from 'src/modules/uploads/uploads.module';
import { WorkOrderModule } from 'src/modules/work-orders/work-order.module';
import { ExcelParserService } from './excel-parser.service';
import { ImportErrorExcelService } from './error-excel.service';
import { ImportFieldValidationService } from './field-validation.service';
import { ImportTemplateService } from './import-template.service';
import { ImportJobService } from './import-job.service';
import { ImportsController } from './imports.controller';
import { WorkOrderImportService } from './work-order-import.service';

@Module({
  imports: [
    AiModule,
    UploadsModule,
    WorkOrderModule,
    DispatchEngineModule,
    FieldsModule,
    TypeOrmModule.forFeature([FieldConfig, ImportJob, Customer, CustomerAssignee]),
  ],
  controllers: [ImportsController],
  providers: [
    ExcelParserService,
    ImportFieldValidationService,
    ImportTemplateService,
    ImportErrorExcelService,
    ImportJobService,
    WorkOrderImportService,
  ],
  exports: [ImportTemplateService, ImportJobService, WorkOrderImportService],
})
export class ImportsModule {}
