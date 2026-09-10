import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type CompletionEmailStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled';
export interface PortalNotificationContext {
  kind: 'account_opened' | 'salary_monthly' | 'salary_reminder' | 'salary_escalation';
  accountId?: string;
  accountVersion?: number;
  loginEmail?: string;
  salaryMonth?: string;
  billingDate?: string;
  scheduledDate: string;
  offset?: 1 | 2 | 3;
}

@Entity({ name: 'work_order_completion_emails' })
export class WorkOrderCompletionEmail {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'deduplication_key', type: 'varchar', length: 255, nullable: true })
  deduplicationKey!: string | null;

  @Column({ name: 'notification_context', type: 'jsonb', nullable: true })
  notificationContext!: PortalNotificationContext | null;

  @Column({ name: 'claim_token', type: 'uuid', nullable: true })
  claimToken!: string | null;

  @Column({ name: 'work_order_id', type: 'uuid', nullable: true })
  workOrderId!: string | null;

  @Column({ name: 'portal_submission_id', type: 'uuid', nullable: true })
  portalSubmissionId!: string | null;

  @Column({ name: 'attachment_ids', type: 'jsonb', default: () => "'[]'::jsonb" })
  attachmentIds!: string[];

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ name: 'completed_version', type: 'int' })
  completedVersion!: number;

  @Column({ name: 'template_code', type: 'varchar', length: 128 })
  templateCode!: string;

  @Column({ name: 'template_version', type: 'varchar', length: 64 })
  templateVersion!: string;

  @Column({ name: 'to_recipients', type: 'text', array: true, default: () => "'{}'::text[]" })
  toRecipients!: string[];

  @Column({ name: 'cc_recipients', type: 'text', array: true, default: () => "'{}'::text[]" })
  ccRecipients!: string[];

  @Column({ name: 'reply_to', type: 'varchar', length: 320, nullable: true })
  replyTo!: string | null;

  @Column({ type: 'varchar', length: 255 })
  subject!: string;

  @Column({ name: 'body_snapshot', type: 'text' })
  bodySnapshot!: string;

  @Column({ name: 'attachment_id', type: 'varchar', length: 128, nullable: true })
  attachmentId!: string | null;

  @Column({ name: 'attachment_hash', type: 'varchar', length: 128, nullable: true })
  attachmentHash!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: CompletionEmailStatus;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount!: number;

  @Column({ name: 'next_retry_at', type: 'timestamptz', nullable: true })
  nextRetryAt!: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
