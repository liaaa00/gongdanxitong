import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DispatchStrategy } from './enums';

@Entity({ name: 'work_order_modules' })
export class WorkOrderModuleConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'module_code', type: 'varchar', length: 64, unique: true })
  moduleCode!: string;

  @Column({ name: 'module_name', type: 'varchar', length: 128 })
  moduleName!: string;

  @Column({ name: 'parent_module_code', type: 'varchar', length: 64, nullable: true })
  parentModuleCode!: string | null;

  @ManyToOne(() => WorkOrderModuleConfig, (module) => module.children, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'parent_module_code', referencedColumnName: 'moduleCode' })
  parent!: WorkOrderModuleConfig | null;

  @OneToMany(() => WorkOrderModuleConfig, (module) => module.parent)
  children!: WorkOrderModuleConfig[];

  @Column({ name: 'module_type', type: 'varchar', length: 32, default: 'sub_module' })
  moduleType!: string;

  @Column({ name: 'description', type: 'varchar', length: 512, nullable: true })
  description!: string | null;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({
    name: 'dispatch_strategy',
    type: 'enum',
    enum: DispatchStrategy,
    default: DispatchStrategy.TEAM_CLAIM,
  })
  dispatchStrategy!: DispatchStrategy;

  @Column({ name: 'sla_hours', type: 'int', nullable: true })
  slaHours!: number | null;

  @Column({ name: 'sla_reminder_before_hours', type: 'int', nullable: true })
  slaReminderBeforeHours!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
