import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DispatchedOrder,
  DispatchedOrderReturnRecord,
  FieldConfig,
  ModuleField,
  ModuleHandler,
  ModuleSupervisor,
  Notification,
  OperationLog,
  OrderStage,
  UserRole,
  WorkOrder,
  WorkOrderFieldDirtyMark,
} from 'src/entities';
import { ExportTemplatesModule } from 'src/modules/admin/export-templates/export-templates.module';
import { FieldPermissionsModule } from 'src/modules/field-permissions/field-permissions.module';
import { FieldSupplementModule } from 'src/modules/field-supplement/field-supplement.module';
import { NotificationModule } from 'src/modules/notifications/notification.module';
import { WorkOrderModule } from 'src/modules/work-orders/work-order.module';
import { DispatchedOrderController, WorkOrderSubOrderController } from './dispatched-order.controller';
import { DispatchedOrderService } from './dispatched-order.service';
import { SlaNotificationService } from './sla-notification.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DispatchedOrder,
      DispatchedOrderReturnRecord,
      WorkOrder,
      ModuleHandler,
      ModuleSupervisor,
      UserRole,
      FieldConfig,
      ModuleField,
      Notification,
      OperationLog,
      OrderStage,
      WorkOrderFieldDirtyMark,
    ]),
    ExportTemplatesModule,
    FieldPermissionsModule,
    FieldSupplementModule,
    NotificationModule,
    WorkOrderModule,
  ],
  controllers: [DispatchedOrderController, WorkOrderSubOrderController],
  providers: [DispatchedOrderService, SlaNotificationService],
  exports: [DispatchedOrderService, SlaNotificationService],
})
export class DispatchedOrderModule {}
