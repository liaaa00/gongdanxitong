import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer, CustomerPortalAccount, CustomerPortalRule } from 'src/entities';
import { CustomerPortalAccountsController, PortalAuthController } from './customer-portal-accounts.controller';
import { CustomerPortalAccountsService } from './customer-portal-accounts.service';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerPortalAccount, Customer, CustomerPortalRule])],
  controllers: [CustomerPortalAccountsController, PortalAuthController],
  providers: [CustomerPortalAccountsService],
  exports: [CustomerPortalAccountsService],
})
export class CustomerPortalAccountsModule {}
