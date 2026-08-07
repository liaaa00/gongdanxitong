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
import { User } from './user.entity';

@Entity({ name: 'module_supervisors' })
@Unique('uq_module_supervisors_module_user_scope', ['moduleCode', 'supervisorId', 'businessScope'])
export class ModuleSupervisor {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'module_code', type: 'varchar', length: 64 })
  moduleCode!: string;

  @Column({ name: 'business_scope', type: 'varchar', length: 32, default: BusinessScope.BEILUN })
  businessScope!: BusinessScope;

  @Column({ name: 'supervisor_id', type: 'uuid' })
  supervisorId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'supervisor_id' })
  supervisor!: User;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
