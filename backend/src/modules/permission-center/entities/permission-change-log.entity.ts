import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { PermissionConfigVersionEntity } from './permission-config-version.entity';

@Entity('permission_change_logs')
export class PermissionChangeLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  version_id: string;

  @ManyToOne(() => PermissionConfigVersionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'version_id' })
  version: PermissionConfigVersionEntity;

  @Column({ type: 'varchar', length: 50 })
  change_type: string;

  @Column({ type: 'varchar', length: 200 })
  target_resource: string;

  @Column({ type: 'jsonb', nullable: true })
  old_value: any;

  @Column({ type: 'jsonb', nullable: true })
  new_value: any;

  @Column({ type: 'uuid', nullable: true })
  changed_by: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  @Index()
  changed_at: Date;

  @Column({ type: 'text', nullable: true })
  reason: string | null;
}
