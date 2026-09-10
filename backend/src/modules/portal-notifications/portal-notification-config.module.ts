import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PortalNotificationSetting } from 'src/entities/portal-notification-setting.entity';
import { PortalNotificationSettingsService } from './portal-notification-settings.service';
import { PortalNotificationEligibilityService } from './portal-notification-eligibility.service';

@Module({ imports: [TypeOrmModule.forFeature([PortalNotificationSetting])], providers: [PortalNotificationSettingsService, PortalNotificationEligibilityService], exports: [PortalNotificationSettingsService, PortalNotificationEligibilityService] })
export class PortalNotificationConfigModule {}
