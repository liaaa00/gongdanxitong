import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DispatchedOrder,
  FieldSupplementLog,
  FieldSupplementRule,
  Notification,
  WorkOrder,
} from 'src/entities';
import { FieldPermissionsModule } from 'src/modules/field-permissions/field-permissions.module';
import { NotificationModule } from 'src/modules/notifications/notification.module';
import { FieldSupplementService } from './field-supplement.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FieldSupplementRule,
      FieldSupplementLog,
      WorkOrder,
      DispatchedOrder,
      Notification,
    ]),
    FieldPermissionsModule,
    NotificationModule,
  ],
  providers: [FieldSupplementService],
  exports: [FieldSupplementService],
})
export class FieldSupplementModule {}
