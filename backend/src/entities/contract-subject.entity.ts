import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'contract_subjects' })
@Index('uq_contract_subjects_social_credit_code', ['socialCreditCode'], { unique: true })
@Index('idx_contract_subjects_active_name', ['isActive', 'subjectName'])
export class ContractSubject {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'subject_name', type: 'varchar', length: 256 })
  subjectName!: string;

  @Column({ name: 'social_credit_code', type: 'varchar', length: 32, nullable: true })
  socialCreditCode!: string | null;

  @Column({ type: 'varchar', length: 32 })
  province!: string;

  @Column({ type: 'varchar', length: 64 })
  city!: string;

  @Column({ name: 'registered_address', type: 'text' })
  registeredAddress!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
