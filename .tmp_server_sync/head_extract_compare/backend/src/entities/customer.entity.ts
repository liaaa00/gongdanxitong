import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Branch } from './branch.entity';
import { CustomerAssignee } from './customer-assignee.entity';
import { WorkOrder } from './work-order.entity';

@Entity({ name: 'customers' })
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'customer_code', type: 'varchar', length: 64, unique: true })
  customerCode!: string;

  @Column({ name: 'customer_name', type: 'varchar', length: 128 })
  customerName!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => Branch, (branch) => branch.customer)
  branches!: Branch[];

  @OneToMany(() => CustomerAssignee, (assignee) => assignee.customer)
  assignees!: CustomerAssignee[];

  @OneToMany(() => WorkOrder, (workOrder) => workOrder.customer)
  workOrders!: WorkOrder[];
}
