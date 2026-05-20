import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity({ name: 'export_templates' })
export class ExportTemplate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'template_name', type: 'varchar', length: 128 })
  templateName!: string;

  @Column({ name: 'module_code', type: 'varchar', length: 64 })
  moduleCode!: string;

  @Column({ name: 'field_list', type: 'jsonb' })
  fieldList!: Array<Record<string, unknown>>;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @ManyToOne(() => User, (user) => user.exportTemplates, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'created_by' })
  creator!: User | null;

  @Column({ name: 'is_shared', type: 'boolean', default: false })
  isShared!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
