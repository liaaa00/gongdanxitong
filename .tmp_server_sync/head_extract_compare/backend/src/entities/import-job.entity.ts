import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ImportJobStatus } from './enums';
import { User } from './user.entity';

@Entity({ name: 'import_jobs' })
export class ImportJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.importJobs, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'file_path', type: 'varchar', length: 512 })
  filePath!: string;

  @Column({ name: 'total_rows', type: 'int', default: 0 })
  totalRows!: number;

  @Column({ name: 'success_rows', type: 'int', default: 0 })
  successRows!: number;

  @Column({ name: 'fail_rows', type: 'int', default: 0 })
  failRows!: number;

  @Column({ name: 'field_mapping', type: 'jsonb', nullable: true })
  fieldMapping!: Record<string, string> | null;

  @Column({
    type: 'enum',
    enum: ImportJobStatus,
    default: ImportJobStatus.PROCESSING,
  })
  status!: ImportJobStatus;

  @Column({ name: 'error_report_url', type: 'varchar', length: 512, nullable: true })
  errorReportUrl!: string | null;

  @Column({ name: 'ai_model_used', type: 'varchar', length: 128, nullable: true })
  aiModelUsed!: string | null;

  @Column({ name: 'ai_prompt_hash', type: 'varchar', length: 128, nullable: true })
  aiPromptHash!: string | null;

  @Column({ name: 'ai_mapping_raw', type: 'jsonb', nullable: true })
  aiMappingRaw!: Record<string, unknown> | null;

  @Column({ name: 'ai_fallback_reason', type: 'varchar', length: 64, nullable: true })
  aiFallbackReason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
