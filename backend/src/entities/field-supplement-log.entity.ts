import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DispatchedOrder } from './dispatched-order.entity';
import { User } from './user.entity';
import { WorkOrder } from './work-order.entity';

@Entity({ name: 'field_supplement_logs' })
export class FieldSupplementLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'work_order_id', type: 'uuid' })
  workOrderId!: string;

  @ManyToOne(() => WorkOrder, (workOrder) => workOrder.fieldSupplementLogs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'work_order_id' })
  workOrder!: WorkOrder;

  @Column({ name: 'dispatched_order_id', type: 'uuid' })
  dispatchedOrderId!: string;

  @ManyToOne(() => DispatchedOrder, (dispatchedOrder) => dispatchedOrder.fieldSupplementLogs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'dispatched_order_id' })
  dispatchedOrder!: DispatchedOrder;

  @Column({ name: 'field_code', type: 'varchar', length: 128 })
  fieldCode!: string;

  @Column({ name: 'old_value', type: 'text', nullable: true })
  oldValue!: string | null;

  @Column({ name: 'new_value', type: 'text', nullable: true })
  newValue!: string | null;

  @Column({ name: 'supplemented_by', type: 'uuid' })
  supplementedById!: string;

  @ManyToOne(() => User, (user) => user.supplementLogs, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'supplemented_by' })
  supplementedBy!: User;

  @Column({ name: 'supplemented_at', type: 'timestamptz' })
  supplementedAt!: Date;
}
