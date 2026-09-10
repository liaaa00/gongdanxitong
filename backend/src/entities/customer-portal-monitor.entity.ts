import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'customer_portal_monitor_requests' })
export class CustomerPortalMonitorRequest {
  @PrimaryColumn('uuid') id!: string;
  @Column({ name: 'request_key', length: 64, default: '' }) requestKey!: string;
  @Column({ length: 48 }) action!: string;
  @Column({ name: 'business_type', type: 'varchar', length: 16, nullable: true }) businessType!: string | null;
  @Column({ name: 'customer_id', type: 'uuid', nullable: true }) customerId!: string | null;
  @Column({ name: 'account_id', type: 'uuid', nullable: true }) accountId!: string | null;
  @Column({ name: 'gateway_received_at', type: 'timestamptz', nullable: true }) gatewayReceivedAt!: Date | null;
  @Column({ name: 'connector_received_at', type: 'timestamptz', nullable: true }) connectorReceivedAt!: Date | null;
  @Column({ name: 'backend_received_at', type: 'timestamptz', nullable: true }) backendReceivedAt!: Date | null;
  @Column({ name: 'backend_responded_at', type: 'timestamptz', nullable: true }) backendRespondedAt!: Date | null;
  @Column({ name: 'portal_responded_at', type: 'timestamptz', nullable: true }) portalRespondedAt!: Date | null;
  @Column({ name: 'timed_out_at', type: 'timestamptz', nullable: true }) timedOutAt!: Date | null;
  @Column({ name: 'failed_at', type: 'timestamptz', nullable: true }) failedAt!: Date | null;
  @Column({ name: 'failure_code', type: 'varchar', length: 40, nullable: true }) failureCode!: string | null;
  @Column({ name: 'backend_succeeded', type: 'boolean', nullable: true }) backendSucceeded!: boolean | null;
  @Column({ name: 'submission_ids', type: 'jsonb', default: () => "'[]'::jsonb" }) submissionIds!: string[];
  @Column({ name: 'returned_submission_ids', type: 'jsonb', default: () => "'[]'::jsonb" }) returnedSubmissionIds!: string[];
}

@Entity({ name: 'customer_portal_monitor_events' })
export class CustomerPortalMonitorEvent {
  @PrimaryColumn('uuid') id!: string;
  @Column({ name: 'journal_id', type: 'uuid' }) journalId!: string;
  @Column({ type: 'bigint' }) sequence!: string;
  @Column({ name: 'trace_id', type: 'uuid' }) traceId!: string;
  @Column({ length: 32 }) stage!: string;
  @Column({ type: 'timestamptz' }) at!: Date;
  @Column({ name: 'failure_code', type: 'varchar', length: 40, nullable: true }) failureCode!: string | null;
}

@Entity({ name: 'customer_portal_monitor_connections' })
export class CustomerPortalMonitorConnection {
  @PrimaryColumn('uuid') id!: string;
  @Column({ name: 'last_heartbeat_at', type: 'timestamptz' }) lastHeartbeatAt!: Date;
  @Column({ name: 'connector_connected', type: 'boolean' }) connectorConnected!: boolean;
}
