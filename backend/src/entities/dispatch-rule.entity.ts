import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Customer } from './customer.entity';
import { Department } from './department.entity';
import { DispatchStrategy, OrderType } from './enums';
import { User } from './user.entity';

@Entity({ name: 'dispatch_rules' })
export class DispatchRule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'rule_name', type: 'varchar', length: 128 })
  ruleName!: string;

  @Column({
    name: 'order_type',
    type: 'enum',
    enum: OrderType,
  })
  orderType!: OrderType;

  @Column({ name: 'trigger_conditions', type: 'jsonb', nullable: true })
  triggerConditions!: Record<string, unknown> | null;

  @Column({ name: 'target_module', type: 'varchar', length: 64 })
  targetModule!: string;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId!: string | null;

  @ManyToOne(() => Customer, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer | null;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId!: string | null;

  @ManyToOne(() => Department, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'department_id' })
  department!: Department | null;

  @Column({ name: 'sub_module', type: 'varchar', length: 32, nullable: true })
  subModule!: string | null;

  @Column({ name: 'assignee_user_id', type: 'uuid', nullable: true })
  assigneeUserId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assignee_user_id' })
  assigneeUser!: User | null;

  @Column({ name: 'fallback_user_id', type: 'uuid', nullable: true })
  fallbackUserId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'fallback_user_id' })
  fallbackUser!: User | null;

  @Column({ name: 'allow_manual_override', type: 'boolean', default: true })
  allowManualOverride!: boolean;

  @Column({
    name: 'dispatch_strategy',
    type: 'enum',
    enum: DispatchStrategy,
    default: DispatchStrategy.FIXED,
  })
  dispatchStrategy!: DispatchStrategy;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'int', default: 100 })
  priority!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
