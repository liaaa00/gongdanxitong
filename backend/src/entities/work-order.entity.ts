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
import { Branch } from './branch.entity';
import { Customer } from './customer.entity';
import { Department } from './department.entity';
import { BusinessScope, OrderType, WorkOrderStatus } from './enums';
import { User } from './user.entity';
import { DispatchedOrder } from './dispatched-order.entity';
import { FieldSupplementLog } from './field-supplement-log.entity';

@Entity({ name: 'work_orders' })
export class WorkOrder {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'order_no', type: 'varchar', length: 64, unique: true })
  orderNo!: string;

  @Column({
    name: 'order_type',
    type: 'enum',
    enum: OrderType,
  })
  orderType!: OrderType;

  @Column({
    name: 'business_scope',
    type: 'varchar',
    length: 32,
    default: BusinessScope.BEILUN,
  })
  businessScope!: BusinessScope;

  @Column({
    type: 'enum',
    enum: WorkOrderStatus,
    default: WorkOrderStatus.DRAFT,
  })
  status!: WorkOrderStatus;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @ManyToOne(() => User, (user) => user.createdWorkOrders, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  creator!: User;

  @Column({ name: 'department_id', type: 'uuid' })
  departmentId!: string;

  @ManyToOne(() => Department, (department) => department.workOrders, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'department_id' })
  department!: Department;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @ManyToOne(() => Customer, (customer) => customer.workOrders, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId!: string | null;

  @ManyToOne(() => Branch, (branch) => branch.workOrders, {
    onDelete: 'RESTRICT',
    nullable: true,
  })
  @JoinColumn({ name: 'branch_id' })
  branch!: Branch | null;

  @Column({ name: 'customer_code', type: 'varchar', length: 64, nullable: true })
  customerCode!: string | null;

  @Column({ name: 'branch_code', type: 'varchar', length: 64, nullable: true })
  branchCode!: string | null;

  @Column({ name: 'customer_name', type: 'varchar', length: 128, nullable: true })
  customerName!: string | null;

  @Column({ name: 'employee_name', type: 'varchar', length: 128 })
  employeeName!: string;

  @Column({ name: 'employee_id_card', type: 'varchar', length: 64 })
  employeeIdCard!: string;

  @Column({ name: 'extra_data', type: 'jsonb', default: () => "'{}'::jsonb" })
  extraData!: Record<string, unknown>;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'last_modified_at', type: 'timestamptz', nullable: true })
  lastModifiedAt!: Date | null;

  @Column({ name: 'last_modified_by', type: 'uuid', nullable: true })
  lastModifiedBy!: string | null;

  @Column({ name: 'modification_round', type: 'int', default: 0 })
  modificationRound!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => DispatchedOrder, (dispatchedOrder) => dispatchedOrder.parentOrder)
  dispatchedOrders!: DispatchedOrder[];

  @OneToMany(() => FieldSupplementLog, (supplementLog) => supplementLog.workOrder)
  fieldSupplementLogs!: FieldSupplementLog[];
}
