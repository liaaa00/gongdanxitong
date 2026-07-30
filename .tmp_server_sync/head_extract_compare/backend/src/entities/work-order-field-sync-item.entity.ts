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
import { WorkOrderFieldSyncBatch } from './work-order-field-sync-batch.entity';
import { WorkOrder } from './work-order.entity';

export type WorkOrderFieldSyncItemStatus = 'synced' | 'approval_pending' | 'approved' | 'rejected' | 'kept_old';

@Entity({ name: 'work_order_field_sync_items' })
export class WorkOrderFieldSyncItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'batch_id', type: 'uuid' })
  batchId!: string;

  @ManyToOne(() => WorkOrderFieldSyncBatch, (batch) => batch.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batch_id' })
  batch!: WorkOrderFieldSyncBatch;

  @Column({ name: 'work_order_id', type: 'uuid' })
  workOrderId!: string;

  @ManyToOne(() => WorkOrder, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'work_order_id' })
  workOrder!: WorkOrder;

  @Column({ name: 'dispatched_order_id', type: 'uuid' })
  dispatchedOrderId!: string;

  @ManyToOne(() => DispatchedOrder, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dispatched_order_id' })
  dispatchedOrder!: DispatchedOrder;

  @Column({ name: 'module_code', type: 'varchar', length: 64 })
  moduleCode!: string;

  @Column({ name: 'field_code', type: 'varchar', length: 128 })
  fieldCode!: string;

  @Column({ name: 'field_label', type: 'varchar', length: 128, nullable: true })
  fieldLabel!: string | null;

  @Column({ name: 'old_value', type: 'jsonb', nullable: true })
  oldValue!: unknown | null;

  @Column({ name: 'new_value', type: 'jsonb', nullable: true })
  newValue!: unknown | null;

  @Column({ name: 'status', type: 'varchar', length: 32 })
  status!: WorkOrderFieldSyncItemStatus;

  @Column({ name: 'requires_approval', type: 'boolean', default: false })
  requiresApproval!: boolean;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'approved_by' })
  approvedByUser!: User | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'comment', type: 'varchar', length: 512, nullable: true })
  comment!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
