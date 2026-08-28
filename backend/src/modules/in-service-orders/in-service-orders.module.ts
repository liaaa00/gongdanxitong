import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Department,
  FieldConfig,
  InServiceOrder,
  ModuleHandler,
  Notification,
  OperationLog,
  WorkOrder,
  WorkflowDefinition,
} from 'src/entities';
import { DetailViewTemplatesModule } from 'src/modules/admin/detail-view-templates/detail-view-templates.module';
import { ExportTemplatesModule } from 'src/modules/admin/export-templates/export-templates.module';
import { FieldPermissionsModule } from 'src/modules/field-permissions/field-permissions.module';
import { WorkOrderModule } from 'src/modules/work-orders/work-order.module';
import { DispatchEngineModule } from 'src/modules/dispatch-engine/dispatch-engine.module';
import { InServiceOrdersController } from './in-service-orders.controller';
import { InServiceOrdersService } from './in-service-orders.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InServiceOrder,
      WorkOrder,
      WorkflowDefinition,
      Department,
      ModuleHandler,
      Notification,
      OperationLog,
      FieldConfig,
    ]),
    DispatchEngineModule,
    DetailViewTemplatesModule,
    ExportTemplatesModule,
    FieldPermissionsModule,
    WorkOrderModule,
  ],
  controllers: [InServiceOrdersController],
  providers: [InServiceOrdersService],
  exports: [InServiceOrdersService],
})
export class InServiceOrdersModule {}
