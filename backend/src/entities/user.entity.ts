import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CustomerAssignee } from './customer-assignee.entity';
import { DispatchedOrder } from './dispatched-order.entity';
import { ExportTemplate } from './export-template.entity';
import { FieldSupplementLog } from './field-supplement-log.entity';
import { ImportJob } from './import-job.entity';
import { ModuleHandler } from './module-handler.entity';
import { OperationLog } from './operation-log.entity';
import { UserRole } from './user-role.entity';
import { WorkOrder } from './work-order.entity';
import { BusinessScope } from './enums';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  username!: string;

  @Column({ name: 'real_name', type: 'varchar', length: 128 })
  realName!: string;

  @Column({ type: 'varchar', length: 128, unique: true, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone!: string | null;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ name: 'group_code', type: 'varchar', length: 32, nullable: true })
  groupCode!: string | null;

  @Column({
    name: 'business_scope',
    type: 'varchar',
    length: 32,
    default: BusinessScope.BEILUN,
  })
  businessScope!: BusinessScope;

  @Column({ name: 'must_change_password', type: 'boolean', default: true })
  mustChangePassword!: boolean;

  @Column({ name: 'password_updated_at', type: 'timestamptz', nullable: true })
  passwordUpdatedAt!: Date | null;

  @Column({ name: 'auth_version', type: 'int', default: 0 })
  authVersion!: number;

  @Column({ name: 'failed_login_attempts', type: 'int', default: 0 })
  failedLoginAttempts!: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil!: Date | null;

  @Column({ name: 'avatar_url', type: 'varchar', length: 512, nullable: true })
  avatarUrl!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => UserRole, (userRole) => userRole.user)
  userRoles!: UserRole[];

  @OneToMany(() => CustomerAssignee, (assignee) => assignee.user)
  customerAssignees!: CustomerAssignee[];

  @OneToMany(() => ModuleHandler, (moduleHandler) => moduleHandler.handler)
  moduleHandlers!: ModuleHandler[];

  @OneToMany(() => WorkOrder, (workOrder) => workOrder.creator)
  createdWorkOrders!: WorkOrder[];

  @OneToMany(() => DispatchedOrder, (dispatchedOrder) => dispatchedOrder.handler)
  dispatchedOrders!: DispatchedOrder[];

  @OneToMany(() => FieldSupplementLog, (supplementLog) => supplementLog.supplementedBy)
  supplementLogs!: FieldSupplementLog[];

  @OneToMany(() => OperationLog, (operationLog) => operationLog.user)
  operationLogs!: OperationLog[];

  @OneToMany(() => ImportJob, (importJob) => importJob.user)
  importJobs!: ImportJob[];

  @OneToMany(() => ExportTemplate, (exportTemplate) => exportTemplate.creator)
  exportTemplates!: ExportTemplate[];
}
