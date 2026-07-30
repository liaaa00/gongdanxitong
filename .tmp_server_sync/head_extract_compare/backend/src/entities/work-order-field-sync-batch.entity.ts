import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DispatchedOrder } from './dispatched-order.entity';
import { User } from './user.entity';
import { WorkOrder } from './work-order.entity';
import { WorkOrderFieldSyncItem } from './work-order-field-sync-item.entity';

export type WorkOrderFieldSyncBatchStatus = 'direct_synced' | 'approval_pending' | 'approved' | 'rejected' | 'partial';
export type WorkOrderFieldSyncTrigger = 'creator_update_before_accept' | 'creator_modify_request' | 'creator_modify_approve';

@Entity({ name: 'work_order_field_sync_batches' })
export class WorkOrderFieldSyncBatch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'work_order_id', type: 'uuid' })
  workOrderId!: string;

  @ManyToOne(() => WorkOrder, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'work_order_id' })
  workOrder!: WorkOrder;

  @Column({ name: 'source_dispatched_order_id', type: 'uuid' })
  sourceDispatchedOrderId!: string;

  @ManyToOne(() => DispatchedOrder, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'source_dispatched_order_id' })
  sourceDispatchedOrder!: DispatchedOrder;

  @Column({ name: 'source_module_code', type: 'varchar', length: 64 })
  sourceModuleCode!: string;

  @Column({ name: 'trigger', type: 'varchar', length: 64 })
  trigger!: WorkOrderFieldSyncTrigger;

  @Column({ name: 'status', type: 'varchar', length: 32 })
  status!: WorkOrderFieldSyncBatchStatus;

  @Column({ name: 'changed_fields', type: 'jsonb' })
  changedFields!: string[];

  @Column({ name: 'requested_by', type: 'uuid', nullable: true })
  requestedBy!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'requested_by' })
  requestedByUser!: User | null;

  @Column({ name: 'reason', type: 'varchar', length: 512, nullable: true })
  reason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => WorkOrderFieldSyncItem, (item) => item.batch)
  items!: WorkOrderFieldSyncItem[];
}
