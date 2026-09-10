import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerPortalRule, WorkOrderCompletionEmail } from 'src/entities';
import { UploadsModule } from 'src/modules/uploads/uploads.module';
import { CompletionEmailService } from './completion-email.service';
import { CompletionEmailDeliveryService } from './completion-email-delivery.service';

@Module({
  imports: [TypeOrmModule.forFeature([WorkOrderCompletionEmail, CustomerPortalRule]), UploadsModule],
  providers: [CompletionEmailService, CompletionEmailDeliveryService],
  exports: [CompletionEmailService, CompletionEmailDeliveryService],
})
export class CompletionEmailModule {}
