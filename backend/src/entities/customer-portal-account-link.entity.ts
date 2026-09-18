import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Customer } from './customer.entity';
import { CustomerPortalAccount } from './customer-portal-account.entity';

/**
 * 一个门户账号可关联多个客户主体（会议口径：一个客户组=一个门户账号）。
 * accounts.customer_id 保留为"主主体"外键；本表是该语义的显式展开，
 * is_primary=true 的行必须等于 account.customer_id（应用层不变式，
 * 迁移回填保证存量账号各有且仅有一条主主体行）。
 */
@Entity({ name: 'customer_portal_account_links' })
@Index('uq_portal_account_links_account_customer', ['accountId', 'customerId'], { unique: true })
@Index('ix_portal_account_links_customer', ['customerId'])
export class CustomerPortalAccountLink {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'account_id', type: 'uuid' })
  @Index('uq_portal_account_links_primary', { unique: true, where: 'is_primary' })
  accountId!: string;

  @ManyToOne(() => CustomerPortalAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account!: CustomerPortalAccount;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @ManyToOne(() => Customer, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @Column({ name: 'is_primary', type: 'boolean', default: true })
  isPrimary!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
