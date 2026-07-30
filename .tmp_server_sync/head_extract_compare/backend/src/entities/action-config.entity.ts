import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { WorkOrderModuleConfig } from './work-order-module.entity';

@Entity({ name: 'action_configs' })
@Unique('uq_action_configs_module_action', ['moduleCode', 'actionCode'])
export class ActionConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'module_code', type: 'varchar', length: 64 })
  moduleCode!: string;

  @ManyToOne(() => WorkOrderModuleConfig, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'module_code', referencedColumnName: 'moduleCode' })
  module!: WorkOrderModuleConfig;

  @Column({ name: 'action_code', type: 'varchar', length: 64 })
  actionCode!: string;

  @Column({ name: 'action_name', type: 'varchar', length: 128 })
  actionName!: string;

  @Column({ name: 'required_roles', type: 'jsonb', nullable: true })
  requiredRoles!: string[] | null;

  @Column({ name: 'form_schema', type: 'jsonb', nullable: true })
  formSchema!: Record<string, unknown> | null;

  @Column({ name: 'remark_required', type: 'boolean', default: false })
  remarkRequired!: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
