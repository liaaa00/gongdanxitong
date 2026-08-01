import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { PermissionConfig } from '../types/permission-config.types';

@Entity('permission_config_versions')
export class PermissionConfigVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  @Index()
  version!: string;

  @Column({ type: 'jsonb' })
  config!: PermissionConfig;

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
