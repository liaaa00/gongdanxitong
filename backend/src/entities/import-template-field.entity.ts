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
import { FieldConfig } from './field-config.entity';
import { OrderType } from './enums';

@Entity({ name: 'import_template_fields' })
@Unique('uq_import_template_fields_order_field', ['orderType', 'fieldCode'])
export class ImportTemplateField {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'order_type', type: 'enum', enum: OrderType })
  orderType!: OrderType;

  @Column({ name: 'field_code', type: 'varchar', length: 128 })
  fieldCode!: string;

  @ManyToOne(() => FieldConfig, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'field_code', referencedColumnName: 'fieldCode' })
  field!: FieldConfig;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder!: number;

  @Column({ name: 'header_alias', type: 'varchar', length: 128, nullable: true })
  headerAlias!: string | null;

  @Column({ name: 'is_required_override', type: 'boolean', nullable: true })
  isRequiredOverride!: boolean | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
