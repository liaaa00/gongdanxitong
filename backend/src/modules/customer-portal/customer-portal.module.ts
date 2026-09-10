import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer, CustomerPortalRule, FieldConfig, WorkOrder, WorkOrderCompletionEmail } from 'src/entities';
import { CustomerPortalSubmission } from 'src/entities/customer-portal-submission.entity';
import { CustomerPortalAccountsModule } from '../customer-portal-accounts/customer-portal-accounts.module';
import { ImportsModule } from '../imports/imports.module';
import { WorkOrderModule } from '../work-orders/work-order.module';
import { UploadModule } from '../upload/upload.module';
import { CustomerPortalController, CustomerPortalPublicController } from './customer-portal.controller';
import { CustomerPortalService } from './customer-portal.service';

@Module({imports:[TypeOrmModule.forFeature([CustomerPortalSubmission,CustomerPortalRule,Customer,FieldConfig,WorkOrder,WorkOrderCompletionEmail]),CustomerPortalAccountsModule,ImportsModule,WorkOrderModule,UploadModule],controllers:[CustomerPortalPublicController, CustomerPortalController],providers:[CustomerPortalService]})
export class CustomerPortalModule {}
