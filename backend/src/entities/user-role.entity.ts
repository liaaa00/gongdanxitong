import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Department } from './department.entity';
import { Role } from './role.entity';
import { User } from './user.entity';

@Entity({ name: 'user_roles' })
export class UserRole {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @PrimaryColumn({ name: 'role_id', type: 'uuid' })
  roleId!: string;

  @PrimaryColumn({ name: 'department_id', type: 'uuid' })
  departmentId!: string;

  @ManyToOne(() => User, (user) => user.userRoles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => Role, (role) => role.userRoles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role!: Role;

  @ManyToOne(() => Department, (department) => department.userRoles, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'department_id' })
  department!: Department;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
