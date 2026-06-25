import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DispatchedOrder } from './dispatched-order.entity';
import { User } from './user.entity';
import { WorkOrder } from './work-order.entity';

@Entity({ name: 'order_attachments' })
export class OrderAttachment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'work_order_id', type: 'uuid' })
  workOrderId!: string;

  @ManyToOne(() => WorkOrder, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'work_order_id' })
  workOrder!: WorkOrder;

  @Column({ name: 'dispatched_order_id', type: 'uuid', nullable: true })
  dispatchedOrderId!: string | null;

  @ManyToOne(() => DispatchedOrder, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'dispatched_order_id' })
  dispatchedOrder!: DispatchedOrder | null;

  @Column({ name: 'biz_purpose', type: 'varchar', length: 64 })
  bizPurpose!: string;

  @Column({ name: 'file_id', type: 'varchar', length: 128 })
  fileId!: string;

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName!: string;

  @Column({ name: 'original_name', type: 'varchar', length: 255 })
  originalName!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 128 })
  mimeType!: string;

  @Column({ name: 'file_path', type: 'varchar', length: 1024 })
  filePath!: string;

  @Column({ name: 'file_size', type: 'bigint' })
  fileSize!: number;

  @Column({ type: 'varchar', length: 32, default: 'uploaded' })
  status!: string;

  @Column({ name: 'reject_reason', type: 'varchar', length: 512, nullable: true })
  rejectReason!: string | null;

  @Column({ name: 'stamp_no', type: 'varchar', length: 128, nullable: true })
  stampNo!: string | null;

  @Column({ name: 'stamped_at', type: 'timestamptz', nullable: true })
  stampedAt!: Date | null;

  @Column({ name: 'received_at', type: 'timestamptz', nullable: true })
  receivedAt!: Date | null;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reviewed_by' })
  reviewer!: User | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
