import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration, { AppConfig } from './config/configuration';
import { validateEnv } from './config/env.validation';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PasswordChangeGuard } from './common/guards/password-change.guard';
import { RolesGuard } from './common/guards/roles.guard';
import {
  ActionConfig,
  Branch,
  CertificateType,
  Customer,
  CustomerAssignee,
  Department,
  DetailViewTemplate,
  DispatchRule,
  DispatchedOrder,
  ExceptionModuleHandler,
  DispatchedOrderReturnRecord,
  ExportTemplate,
  FieldConfig,
  FieldPermission,
  FieldSupplementLog,
  FieldSupplementRule,
  ImportJob,
  ImportTemplateField,
  InServiceOrder,
  ModuleField,
  ModuleHandler,
  ModuleHandlerDelegation,
  ModuleSupervisor,
  Notification,
  OperationLog,
  OutOfProvinceOrder,
  OrderAttachment,
  OrderStage,
  Role,
  SystemSetting,
  User,
  UserRole,
  WorkOrder,
  WorkOrderFieldDirtyMark,
  WorkOrderFieldSyncBatch,
  WorkOrderFieldSyncItem,
  WorkOrderModuleConfig,
  WorkflowDefinition,
} from './entities';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DetailViewTemplatesModule } from './modules/admin/detail-view-templates/detail-view-templates.module';
import { DispatchedOrderModule } from './modules/dispatched-orders/dispatched-order.module';
import { FieldPermissionInterceptor } from './modules/field-permissions/field-permission.interceptor';
import { FieldPermissionsModule } from './modules/field-permissions/field-permissions.module';
import { HealthModule } from './health/health.module';
import { AiModule } from './modules/ai/ai.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { ImportsModule } from './modules/imports/imports.module';
import { InServiceOrdersModule } from './modules/in-service-orders/in-service-orders.module';
import { OutOfProvinceOrdersModule } from './modules/out-of-province-orders/out-of-province-orders.module';
import { StagesModule } from './modules/stages/stages.module';
import { NotificationModule } from './modules/notifications/notification.module';
import { RoleActionPermissionModule } from './modules/role-action-permissions/role-action-permission.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { WorkOrderModule } from './modules/work-orders/work-order.module';
import { WorkflowModule } from './modules/workflows/workflow.module';
import { SeedOnBootstrapService } from './database/seeds/seed-on-bootstrap.service';
import { OperationLogCleanupService } from './modules/operation-logs/operation-log-cleanup.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => ({
        type: 'postgres',
        host: configService.get<string>('db.host', { infer: true }),
        port: configService.get<number>('db.port', { infer: true }),
        username: configService.get<string>('db.username', { infer: true }),
        password: configService.get<string>('db.password', { infer: true }),
        database: configService.get<string>('db.database', { infer: true }),
        schema: configService.get<string>('db.schema', { infer: true }),
        logging: configService.get<boolean>('db.logging', { infer: true }),
        synchronize: false,
        entities: [
          ActionConfig,
          Branch,
          CertificateType,
          Customer,
          CustomerAssignee,
          Department,
          DetailViewTemplate,
          DispatchRule,
          DispatchedOrder,
          ExceptionModuleHandler,
          DispatchedOrderReturnRecord,
          ExportTemplate,
          FieldConfig,
          FieldPermission,
          FieldSupplementLog,
          FieldSupplementRule,
          ImportJob,
          ImportTemplateField,
          InServiceOrder,
          ModuleField,
          ModuleHandler,
          ModuleHandlerDelegation,
          ModuleSupervisor,
          Notification,
          OperationLog,
          OutOfProvinceOrder,
          OrderAttachment,
          OrderStage,
          Role,
          SystemSetting,
          User,
          UserRole,
          WorkOrder,
          WorkOrderFieldDirtyMark,
          WorkOrderFieldSyncBatch,
          WorkOrderFieldSyncItem,
          WorkOrderModuleConfig,
          WorkflowDefinition,
        ],
      }),
    }),
    TypeOrmModule.forFeature([SystemSetting]),
    AuthModule,
    AdminModule,
    DetailViewTemplatesModule,
    FieldPermissionsModule,
    WorkOrderModule,
    WorkflowModule,
    DispatchedOrderModule,
    DashboardModule,
    AiModule,
    ImportsModule,
    InServiceOrdersModule,
    OutOfProvinceOrdersModule,
    AttachmentsModule,
    StagesModule,
    UploadsModule,
    NotificationModule,
    RoleActionPermissionModule,
    HealthModule,
  ],
  providers: [
    SeedOnBootstrapService,
    OperationLogCleanupService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PasswordChangeGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: FieldPermissionInterceptor,
    },
  ],
})
export class AppModule {}
