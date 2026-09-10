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
import { CustomerRulesModule } from '../customer-rules/customer-rules.module';
import { ContractSubjectsModule } from '../contract-subjects/contract-subjects.module';
import { PortalReviewService } from './portal-review.service';
import { PortalReviewController } from './portal-review.controller';
import { PortalNotificationConfigModule } from '../portal-notifications/portal-notification-config.module';

@Module({imports:[TypeOrmModule.forFeature([CustomerPortalSubmission,CustomerPortalRule,Customer,FieldConfig,WorkOrder,WorkOrderCompletionEmail]),CustomerPortalAccountsModule,ImportsModule,WorkOrderModule,UploadModule,CustomerRulesModule,ContractSubjectsModule,PortalNotificationConfigModule],controllers:[CustomerPortalPublicController, CustomerPortalController, PortalReviewController],providers:[CustomerPortalService, PortalReviewService]})
export class CustomerPortalModule {}
