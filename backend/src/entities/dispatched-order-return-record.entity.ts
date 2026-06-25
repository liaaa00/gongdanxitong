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

@Entity({ name: 'dispatched_order_return_records' })
export class DispatchedOrderReturnRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

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

  @Column({ name: 'returned_by', type: 'uuid' })
  returnedBy!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'returned_by' })
  returnedByUser!: User;

  @Column({ name: 'return_reason', type: 'varchar', length: 512 })
  returnReason!: string;

  @Column({ name: 'before_status', type: 'varchar', length: 32 })
  beforeStatus!: string;

  @Column({ name: 'after_status', type: 'varchar', length: 32 })
  afterStatus!: string;

  @Column({ name: 'payload', type: 'jsonb', nullable: true })
  payload!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
