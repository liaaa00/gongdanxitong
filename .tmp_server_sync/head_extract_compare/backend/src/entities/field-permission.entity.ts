import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { FieldPermissionMode } from './enums';
import { Role } from './role.entity';

@Entity({ name: 'field_permissions' })
@Unique('uq_field_permissions_role_field_scenario', ['roleId', 'fieldCode', 'scenario'])
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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
