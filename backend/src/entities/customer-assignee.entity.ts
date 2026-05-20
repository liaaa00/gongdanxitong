import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Customer } from './customer.entity';
import { User } from './user.entity';

@Entity({ name: 'customer_assignees' })
@Unique('uq_customer_assignees_customer_user', ['customerId', 'userId'])
export class CustomerAssignee {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @ManyToOne(() => Customer, (customer) => customer.assignees, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.customerAssignees, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'group_code', type: 'varchar', length: 32, nullable: true })
  groupCode!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'assigned_at', type: 'timestamptz' })
  assignedAt!: Date;
}
