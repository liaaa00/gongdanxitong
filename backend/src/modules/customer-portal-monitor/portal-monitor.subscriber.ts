import { Injectable } from '@nestjs/common';
import { DataSource, EntitySubscriberInterface, InsertEvent } from 'typeorm';
import { CustomerPortalSubmission } from 'src/entities/customer-portal-submission.entity';
import { portalMonitorContext } from './portal-monitor-context';

/** The link commits with the accepted submission, including every successful Excel row. */
@Injectable()
export class PortalMonitorSubscriber implements EntitySubscriberInterface<CustomerPortalSubmission> {
  constructor(dataSource: DataSource) { dataSource.subscribers.push(this); }
  listenTo() { return CustomerPortalSubmission; }
  beforeInsert(event: InsertEvent<CustomerPortalSubmission>): void {
    const context = portalMonitorContext.getStore();
    if (context && event.entity.customerId === context.customerId && event.entity.accountId === context.accountId) {
      event.entity.monitorTraceId = context.traceId;
    }
  }
}
