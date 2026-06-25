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

@Entity({ name: 'order_stages' })
export class OrderStage {
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

  @Column({ name: 'stage_code', type: 'varchar', length: 64 })
  stageCode!: string;

  @Column({ name: 'stage_name', type: 'varchar', length: 128 })
  stageName!: string;

  @Column({ name: 'stage_status', type: 'varchar', length: 32, default: 'done' })
  stageStatus!: string;

  @Column({ name: 'happened_at', type: 'timestamptz' })
  happenedAt!: Date;

  @Column({ name: 'operator_id', type: 'uuid', nullable: true })
  operatorId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'operator_id' })
  operator!: User | null;

  @Column({ type: 'jsonb', nullable: true })
  payload!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
