import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FieldType, OrderType } from './enums';

@Entity({ name: 'field_configs' })
export class FieldConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'field_code', type: 'varchar', length: 128, unique: true })
  fieldCode!: string;

  @Column({ name: 'field_name', type: 'varchar', length: 128 })
  fieldName!: string;

  @Column({
    name: 'field_type',
    type: 'enum',
    enum: FieldType,
    default: FieldType.TEXT,
  })
  fieldType!: FieldType;

  @Column({ name: 'is_required', type: 'boolean', default: false })
  isRequired!: boolean;

  @Column({ name: 'default_required', type: 'boolean', default: false })
  defaultRequired!: boolean;

  @Column({ name: 'conditional_required', type: 'jsonb', nullable: true })
  conditionalRequired!: Record<string, unknown> | null;

  @Column({ name: 'validation_regex', type: 'varchar', length: 512, nullable: true })
  validationRegex!: string | null;

  @Column({ name: 'validation_msg', type: 'varchar', length: 512, nullable: true })
  validationMsg!: string | null;

  @Column({ name: 'dropdown_options', type: 'jsonb', nullable: true })
  dropdownOptions!: string[] | null;

  @Column({ name: 'collection_group', type: 'varchar', length: 128, nullable: true })
  collectionGroup!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  placeholder!: string | null;

  @Column({ name: 'help_text', type: 'varchar', length: 512, nullable: true })
  helpText!: string | null;

  @Column({
    name: 'order_type',
    type: 'enum',
    enum: OrderType,
    nullable: true,
  })
  orderType!: OrderType | null;

  @Column({ name: 'business_context', type: 'jsonb', nullable: true })
  businessContext!: OrderType[] | null;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
