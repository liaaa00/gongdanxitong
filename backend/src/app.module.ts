import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration, { AppConfig } from './config/configuration';
import { validateEnv } from './config/env.validation';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import {
  ActionConfig,
  Branch,
  Customer,
  CustomerAssignee,
  Department,
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
  ModuleField,
  ModuleHandler,
  ModuleSupervisor,
  Notification,
  OperationLog,
  OrderAttachment,
  OrderStage,
  Role,
  SystemSetting,
  User,
  UserRole,
  WorkOrder,
  WorkOrderFieldDirtyMark,
  WorkOrderModuleConfig,
} from './entities';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DispatchedOrderModule } from './modules/dispatched-orders/dispatched-order.module';
import { FieldPermissionInterceptor } from './modules/field-permissions/field-permission.interceptor';
import { FieldPermissionsModule } from './modules/field-permissions/field-permissions.module';
import { HealthModule } from './health/health.module';
import { AiModule } from './modules/ai/ai.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { ImportsModule } from './modules/imports/imports.module';
import { StagesModule } from './modules/stages/stages.module';
import { NotificationModule } from './modules/notifications/notification.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { WorkOrderModule } from './modules/work-orders/work-order.module';
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
          Customer,
          CustomerAssignee,
          Department,
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
          ModuleField,
          ModuleHandler,
          ModuleSupervisor,
          Notification,
          OperationLog,
          OrderAttachment,
          OrderStage,
          Role,
          SystemSetting,
          User,
          UserRole,
          WorkOrder,
          WorkOrderFieldDirtyMark,
          WorkOrderModuleConfig,
        ],
      }),
    }),
    TypeOrmModule.forFeature([SystemSetting]),
    AuthModule,
    AdminModule,
    FieldPermissionsModule,
    WorkOrderModule,
    DispatchedOrderModule,
    DashboardModule,
    AiModule,
    ImportsModule,
    AttachmentsModule,
    StagesModule,
    UploadsModule,
    NotificationModule,
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
      useClass: RolesGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: FieldPermissionInterceptor,
    },
  ],
})
export class AppModule {}
