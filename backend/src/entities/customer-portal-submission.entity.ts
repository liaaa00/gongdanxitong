import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'customer_portal_submissions' })
export class CustomerPortalSubmission {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'customer_id', type: 'uuid' }) customerId!: string;
  @Column({ name: 'account_id', type: 'uuid' }) accountId!: string;
  @Column({ name: 'business_type', type: 'varchar', length: 16 }) businessType!: 'onboarding' | 'resignation' | 'salary';
  @Column({ name: 'request_id', type: 'varchar', length: 100 }) requestId!: string;
  @Column({ name: 'input_hash', type: 'varchar', length: 64 }) inputHash!: string;
  @Column({ name: 'request_no', type: 'varchar', length: 64 }) requestNo!: string;
  @Column({ name: 'work_order_id', type: 'uuid', nullable: true }) workOrderId!: string | null;
  @Column({ name: 'monitor_trace_id', type: 'uuid', nullable: true }) monitorTraceId!: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) fields!: Record<string, unknown>;
  @Column({ type: 'varchar', length: 16, default: 'received' }) status!: 'received' | 'completed';
  @Column({ name: 'result_note', type: 'text', nullable: true }) resultNote!: string | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
