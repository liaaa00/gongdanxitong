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
import { DispatchedOrderStatus } from './enums';
import { User } from './user.entity';
import { WorkOrder } from './work-order.entity';
import { FieldSupplementLog } from './field-supplement-log.entity';

@Entity({ name: 'dispatched_orders' })
export class DispatchedOrder {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'parent_order_id', type: 'uuid' })
  parentOrderId!: string;

  @ManyToOne(() => WorkOrder, (workOrder) => workOrder.dispatchedOrders, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'parent_order_id' })
  parentOrder!: WorkOrder;

  @Column({ name: 'module_code', type: 'varchar', length: 64 })
  moduleCode!: string;

  @Column({
    type: 'enum',
    enum: DispatchedOrderStatus,
    default: DispatchedOrderStatus.PENDING,
  })
  status!: DispatchedOrderStatus;

  @Column({ name: 'handler_id', type: 'uuid', nullable: true })
  handlerId!: string | null;

  @ManyToOne(() => User, (user) => user.dispatchedOrders, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'handler_id' })
  handler!: User | null;

  @Column({ name: 'visible_fields', type: 'jsonb', nullable: true })
  visibleFields!: string[] | null;

  @Column({ name: 'return_reason', type: 'varchar', length: 512, nullable: true })
  returnReason!: string | null;

  @Column({ name: 'flow_round', type: 'int', default: 0 })
  flowRound!: number;

  @Column({ name: 'completion_remark', type: 'varchar', length: 1024, nullable: true })
  completionRemark!: string | null;

  @Column({ name: 'dispatched_at', type: 'timestamptz', nullable: true })
  dispatchedAt!: Date | null;

  @Column({ name: 'due_at', type: 'timestamptz', nullable: true })
  dueAt!: Date | null;

  @Column({ name: 'sla_hours', type: 'int', nullable: true })
  slaHours!: number | null;

  @Column({ name: 'sla_reminder_before_hours', type: 'int', nullable: true })
  slaReminderBeforeHours!: number | null;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'void_at', type: 'timestamptz', nullable: true })
  voidAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => FieldSupplementLog, (supplementLog) => supplementLog.dispatchedOrder)
  fieldSupplementLogs!: FieldSupplementLog[];
}
