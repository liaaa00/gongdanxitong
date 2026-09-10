import { Module } from '@nestjs/common';
import { PortalNotificationConfigModule } from './portal-notification-config.module';
import { PortalNotificationsService } from './portal-notifications.service';
import { PortalNotificationsController } from './portal-notifications.controller';

@Module({ imports: [PortalNotificationConfigModule], providers: [PortalNotificationsService], controllers: [PortalNotificationsController], exports: [PortalNotificationsService] })
export class PortalNotificationsModule {}
