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
import { BusinessScope } from './enums';
import { FieldConfig } from './field-config.entity';
import { WorkOrderModuleConfig } from './work-order-module.entity';

@Entity({ name: 'module_fields' })
@Unique('uq_module_fields_module_field_scope', ['moduleCode', 'fieldCode', 'businessScope'])
export class ModuleField {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'module_code', type: 'varchar', length: 64 })
  moduleCode!: string;

  @Column({ name: 'business_scope', type: 'varchar', length: 32, default: BusinessScope.BEILUN })
  businessScope!: BusinessScope;

  @ManyToOne(() => WorkOrderModuleConfig, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'module_code', referencedColumnName: 'moduleCode' })
  module!: WorkOrderModuleConfig;

  @Column({ name: 'field_code', type: 'varchar', length: 128 })
  fieldCode!: string;

  @ManyToOne(() => FieldConfig, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'field_code', referencedColumnName: 'fieldCode' })
  field!: FieldConfig;

  @Column({ name: 'group_name', type: 'varchar', length: 128, nullable: true })
  groupName!: string | null;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder!: number;

  @Column({ name: 'is_required_override', type: 'boolean', nullable: true })
  isRequiredOverride!: boolean | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
