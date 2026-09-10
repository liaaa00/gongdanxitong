import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Customer } from './customer.entity';
import { User } from './user.entity';

@Entity({ name: 'customer_portal_rules' })
export class CustomerPortalRule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'customer_id', type: 'uuid', unique: true })
  customerId!: string;

  @OneToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @Column({ name: 'onboarding_defaults', type: 'jsonb', default: () => "'{}'::jsonb" })
  onboardingDefaults!: Record<string, string | number | boolean>;
  @Column({ name: 'resignation_defaults', type: 'jsonb', default: () => "'{}'::jsonb" })
  resignationDefaults!: Record<string, string | number | boolean>;

  @Column({
    name: 'salary_rules',
    type: 'jsonb',
    default: () => "'{\"billingDay\":null,\"reminderEnabled\":true,\"reminderWorkdayOffsets\":[3,2,1]}'::jsonb",
  })
  salaryRules!: {
    billingDay: number | null;
    reminderEnabled: boolean;
    reminderWorkdayOffsets: [3, 2, 1];
  };

  @Column({
    name: 'shared_email_rules',
    type: 'jsonb',
    default: () => "'{\"mailbox\":\"\",\"routeKey\":\"\"}'::jsonb",
  })
  sharedEmailRules!: { mailbox: string; routeKey: string };

  @Column({ name: 'completion_email_enabled', type: 'boolean', default: false })
  completionEmailEnabled!: boolean;

  @Column({ name: 'completion_email_to', type: 'text', array: true, default: () => "'{}'::text[]" })
  completionEmailTo!: string[];

  @Column({ name: 'completion_email_cc', type: 'text', array: true, default: () => "'{}'::text[]" })
  completionEmailCc!: string[];

  @Column({ name: 'completion_email_reply_to', type: 'varchar', length: 320, nullable: true })
  completionEmailReplyTo!: string | null;

  @Column({ name: 'completion_email_business_types', type: 'text', array: true, default: () => "'{onboarding,resignation,salary}'::text[]" })
  completionEmailBusinessTypes!: string[];

  @Column({ name: 'completion_email_fields', type: 'jsonb', default: () => "'[\"order_no\",\"order_type\",\"customer_name\",\"employee_name\",\"employee_id_card\"]'::jsonb" })
  completionEmailFields!: string[];

  @Column({ name: 'objection_deadline_days', type: 'int', nullable: true })
  objectionDeadlineDays!: number | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'updated_by' })
  updater!: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
