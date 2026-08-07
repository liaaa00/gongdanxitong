import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DispatchedOrder,
  FieldConfig,
  ImportJob,
  InServiceOrder,
  ModuleField,
  ModuleHandler,
  ModuleSupervisor,
  Notification,
  OperationLog,
  UserRole,
  WorkOrder,
  WorkOrderFieldDirtyMark,
} from 'src/entities';
import { DispatchEngineModule } from 'src/modules/dispatch-engine/dispatch-engine.module';
import { FieldPermissionsModule } from 'src/modules/field-permissions/field-permissions.module';
import { NotificationModule } from 'src/modules/notifications/notification.module';
import { ResignationCertificateAutomationService } from './resignation-certificate-automation.service';
import { WorkOrderController } from './work-order.controller';
import { WorkOrderResubmitService } from './work-order-resubmit.service';
import { WorkOrderService } from './work-order.service';
import { WorkOrderValidationService } from './work-order-validation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkOrder,
      WorkOrderFieldDirtyMark,
      DispatchedOrder,
      FieldConfig,
      ImportJob,
      InServiceOrder,
      ModuleField,
      ModuleHandler,
      ModuleSupervisor,
      Notification,
      OperationLog,
      UserRole,
    ]),
    FieldPermissionsModule,
    NotificationModule,
    DispatchEngineModule,
  ],
  controllers: [WorkOrderController],
  providers: [
    WorkOrderService,
    WorkOrderResubmitService,
    WorkOrderValidationService,
    ResignationCertificateAutomationService,
  ],
  exports: [
    WorkOrderService,
    WorkOrderResubmitService,
    WorkOrderValidationService,
    ResignationCertificateAutomationService,
  ],
})
export class WorkOrderModule {}
