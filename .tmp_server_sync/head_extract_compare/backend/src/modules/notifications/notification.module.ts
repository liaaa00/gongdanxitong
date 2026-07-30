import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DispatchedOrder, Notification, User, WorkOrder } from 'src/entities';
import { InAppNotificationChannel } from './channels/in-app.channel';
import { MockEmailChannel } from './channels/mock-email.channel';
import { MockSmsChannel } from './channels/mock-sms.channel';
import { FieldChangeHook } from './field-change.hook';
import { NotificationEventBus } from './notification-event-bus';
import { NotificationController } from './notification.controller';
import { NotificationStreamController } from './notification-stream.controller';
import { NotificationService } from './notification.service';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, WorkOrder, DispatchedOrder, User])],
  controllers: [NotificationController, NotificationStreamController],
  providers: [
    FieldChangeHook,
    NotificationEventBus,
    NotificationService,
    InAppNotificationChannel,
    MockEmailChannel,
    MockSmsChannel,
  ],
  exports: [FieldChangeHook, NotificationService, NotificationEventBus],
})
export class NotificationModule {}
