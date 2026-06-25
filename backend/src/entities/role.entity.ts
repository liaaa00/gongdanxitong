import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FieldPermission } from './field-permission.entity';
import { RoleLevel } from './enums';
import { UserRole } from './user-role.entity';

@Entity({ name: 'roles' })
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Column({
    type: 'enum',
    enum: RoleLevel,
    default: RoleLevel.EXECUTION,
  })
  level!: RoleLevel;

  @Column({ type: 'varchar', length: 512, nullable: true })
  description!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => UserRole, (userRole) => userRole.role)
  userRoles!: UserRole[];

  @OneToMany(() => FieldPermission, (fieldPermission) => fieldPermission.role)
  fieldPermissions!: FieldPermission[];
}
