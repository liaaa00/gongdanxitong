import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import {
  BusinessScope,
  BusinessType,
  InServiceHandleChannel,
  InServiceOrderKind,
  InServiceOrderStatus,
  OrderType,
  ProcessType,
  RequirementType,
} from './enums';
import { Customer } from './customer.entity';
import { Department } from './department.entity';
import { User } from './user.entity';

export interface InServiceTransferRecord {
  fromHandlerId: string | null;
  toHandlerId: string;
  operatorId: string;
  reason: string | null;
  transferredAt: string;
}

@Entity({ name: 'in_service_orders' })
@Index('uq_in_service_orders_order_no', ['orderNo'], { unique: true })
@Index('idx_in_service_orders_status', ['status'])
@Index('idx_in_service_orders_creator', ['createdBy'])
@Index('idx_in_service_orders_handler', ['handlerId'])
export class InServiceOrder {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'order_no', type: 'varchar', length: 40 })
  orderNo!: string;

  @Column({ name: 'order_type', type: 'varchar', length: 32, default: OrderType.IN_SERVICE })
  orderType!: OrderType;

  @Column({
    name: 'order_kind',
    type: 'varchar',
    length: 40,
    default: InServiceOrderKind.SINGLE_BUSINESS,
  })
  orderKind!: InServiceOrderKind;

  @Column({
    name: 'business_scope',
    type: 'varchar',
    length: 32,
    default: BusinessScope.BEILUN,
  })
  businessScope!: BusinessScope;

  @Column({ name: 'employee_name', type: 'varchar', length: 128, nullable: true })
  employeeName!: string | null;

  @Column({ name: 'id_card_no', type: 'varchar', length: 64, nullable: true })
  idCardNo!: string | null;

  @Column({ name: 'extra_data', type: 'jsonb', default: () => "'{}'::jsonb" })
  extraData!: Record<string, unknown>;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @ManyToOne(() => Customer, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @Column({ name: 'department_id', type: 'uuid' })
  departmentId!: string;

  @ManyToOne(() => Department, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'department_id' })
  department!: Department;

  @Column({ name: 'expected_completion_date', type: 'date', nullable: true })
  expectedCompletionDate!: string | null;

  @Column({ name: 'business_reason', type: 'varchar', length: 512, nullable: true })
  businessReason!: string | null;

  @Column({ name: 'business_type', type: 'varchar', length: 64, nullable: true })
  businessType!: BusinessType | null;

  @Column({ name: 'process_type', type: 'varchar', length: 64, nullable: true })
  processType!: ProcessType | null;

  @Column({ name: 'requirement_type', type: 'varchar', length: 64, nullable: true })
  requirementType!: RequirementType | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  province!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  city!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  district!: string | null;

  @Column({ name: 'contact_phone', type: 'varchar', length: 32, nullable: true })
  contactPhone!: string | null;

  @Column({ name: 'business_description', type: 'text', nullable: true })
  businessDescription!: string | null;

  @Column({ name: 'service_fee', type: 'numeric', precision: 12, scale: 2, nullable: true })
  serviceFee!: number | null;

  @Column({
    name: 'handle_channel',
    type: 'varchar',
    length: 16,
    default: InServiceHandleChannel.ONLINE,
  })
  handleChannel!: InServiceHandleChannel;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  attachments!: string[];

  @Column({ type: 'varchar', length: 32, default: InServiceOrderStatus.DISPATCHED })
  status!: InServiceOrderStatus;

  @Column({ name: 'pending_return_status', type: 'varchar', length: 32, nullable: true })
  pendingReturnStatus!: InServiceOrderStatus | null;

  @Column({ name: 'transfer_history', type: 'jsonb', default: () => "'[]'::jsonb" })
  transferHistory!: InServiceTransferRecord[];

  @Column({ name: 'handler_id', type: 'uuid', nullable: true })
  handlerId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'handler_id' })
  handler!: User | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  creator!: User;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @Column({ name: 'rejected_by', type: 'uuid', nullable: true })
  rejectedBy!: string | null;

  @Column({ name: 'closed_by', type: 'uuid', nullable: true })
  closedBy!: string | null;

  @Column({ name: 'rejection_reason', type: 'varchar', length: 512, nullable: true })
  rejectionReason!: string | null;

  @Column({ name: 'pending_info_reason', type: 'varchar', length: 512, nullable: true })
  pendingInfoReason!: string | null;

  @Column({ name: 'completion_remark', type: 'varchar', length: 512, nullable: true })
  completionRemark!: string | null;

  @Column({ name: 'close_reason', type: 'varchar', length: 512, nullable: true })
  closeReason!: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'rejected_at', type: 'timestamptz', nullable: true })
  rejectedAt!: Date | null;

  @Column({ name: 'dispatched_at', type: 'timestamptz', nullable: true })
  dispatchedAt!: Date | null;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt!: Date | null;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt!: Date | null;

  @Column({ name: 'processing_at', type: 'timestamptz', nullable: true })
  processingAt!: Date | null;

  @Column({ name: 'pending_info_at', type: 'timestamptz', nullable: true })
  pendingInfoAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @VersionColumn({ type: 'int', default: 1 })
  version!: number;
}
