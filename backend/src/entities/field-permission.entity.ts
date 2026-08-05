import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { FieldPermissionMode, BusinessScope } from './enums';
import { Role } from './role.entity';

@Entity({ name: 'field_permissions' })
@Unique('uq_field_permissions_role_field_scenario_scope', ['roleId', 'fieldCode', 'scenario', 'businessScope'])
export class FieldPermission {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'role_id', type: 'uuid' })
  roleId!: string;

  @ManyToOne(() => Role, (role) => role.fieldPermissions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'role_id' })
  role!: Role;

  @Column({ name: 'field_code', type: 'varchar', length: 128 })
  fieldCode!: string;

  @Column({
    type: 'enum',
    enum: FieldPermissionMode,
    default: FieldPermissionMode.VISIBLE,
  })
  permission!: FieldPermissionMode;

  @Column({ type: 'varchar', length: 128 })
  scenario!: string;

  @Column({ name: 'business_scope', type: 'varchar', length: 32, default: 'beilun' })
  businessScope!: BusinessScope;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
