import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CustomerPortalAccountsModule } from '../customer-portal-accounts/customer-portal-accounts.module';
import { CustomerPortalMonitorController, PortalMonitorCollectionController } from './customer-portal-monitor.controller';
import { CustomerPortalMonitorService } from './customer-portal-monitor.service';
import { PortalMonitorConnectorGuard } from './portal-monitor-auth';
import { PortalMonitorInterceptor } from './portal-monitor.interceptor';
import { PortalMonitorSubscriber } from './portal-monitor.subscriber';

@Module({
  imports: [CustomerPortalAccountsModule],
  controllers: [CustomerPortalMonitorController, PortalMonitorCollectionController],
  providers: [CustomerPortalMonitorService, PortalMonitorConnectorGuard, PortalMonitorSubscriber,
    { provide: APP_INTERCEPTOR, useClass: PortalMonitorInterceptor }],
})
export class CustomerPortalMonitorModule {}
