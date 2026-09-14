import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer, CustomerAssignee, CustomerPortalAccount, CustomerPortalRule } from 'src/entities';
import { CustomerPortalAccountsController, PortalAuthController } from './customer-portal-accounts.controller';
import { CustomerPortalAccountsService } from './customer-portal-accounts.service';
import { PortalNotificationsModule } from 'src/modules/portal-notifications/portal-notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerPortalAccount, Customer, CustomerPortalRule, CustomerAssignee]), PortalNotificationsModule],
  controllers: [CustomerPortalAccountsController, PortalAuthController],
  providers: [CustomerPortalAccountsService],
  exports: [CustomerPortalAccountsService],
})
export class CustomerPortalAccountsModule {}
