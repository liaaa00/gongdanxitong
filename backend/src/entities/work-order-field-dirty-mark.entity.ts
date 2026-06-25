import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DispatchedOrder } from './dispatched-order.entity';
import { User } from './user.entity';
import { WorkOrder } from './work-order.entity';

@Entity({ name: 'work_order_field_dirty_marks' })
export class WorkOrderFieldDirtyMark {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'work_order_id', type: 'uuid' })
  workOrderId!: string;

  @ManyToOne(() => WorkOrder, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'work_order_id' })
  workOrder!: WorkOrder;

  @Column({ name: 'dispatched_order_id', type: 'uuid', nullable: true })
  dispatchedOrderId!: string | null;

  @ManyToOne(() => DispatchedOrder, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'dispatched_order_id' })
  dispatchedOrder!: DispatchedOrder | null;

  @Column({ name: 'module_code', type: 'varchar', length: 64 })
  moduleCode!: string;

  @Column({ name: 'field_code', type: 'varchar', length: 128 })
  fieldCode!: string;

  @Column({ name: 'field_label', type: 'varchar', length: 128 })
  fieldLabel!: string;

  @Column({ name: 'old_value', type: 'jsonb', nullable: true })
  oldValue!: unknown | null;

  @Column({ name: 'new_value', type: 'jsonb', nullable: true })
  newValue!: unknown | null;

  @Column({ name: 'changed_by', type: 'uuid' })
  changedBy!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'changed_by' })
  changedByUser!: User;

  @Column({ name: 'changed_at', type: 'timestamptz' })
  changedAt!: Date;

  @Column({ name: 'flow_round', type: 'int', default: 0 })
  flowRound!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'cleared_at', type: 'timestamptz', nullable: true })
  clearedAt!: Date | null;

  @Column({ name: 'cleared_by', type: 'uuid', nullable: true })
  clearedBy!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'cleared_by' })
  clearedByUser!: User | null;

  @Column({ name: 'clear_reason', type: 'varchar', length: 64, nullable: true })
  clearReason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
