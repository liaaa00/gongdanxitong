import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { PermissionConfig } from '../types/permission-config.types';
import { BusinessScope } from 'src/entities';

@Entity('permission_config_versions')
export class PermissionConfigVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  @Index()
  version!: string;

  @Column({ type: 'jsonb' })
  config!: PermissionConfig;

  @Column({ name: 'business_scope', type: 'varchar', length: 32, default: BusinessScope.BEILUN })
  business_scope!: BusinessScope;

  @Column({ type: 'boolean', default: false })
  @Index()
  is_active!: boolean;

  @Column({ type: 'uuid', nullable: true })
  created_by!: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at!: Date;

  @Column({ type: 'timestamp', nullable: true })
  @Index()
  activated_at!: Date | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;
}
