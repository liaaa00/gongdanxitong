import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity({ name: 'module_handlers' })
export class ModuleHandler {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'module_code', type: 'varchar', length: 64 })
  moduleCode!: string;

  @Column({ name: 'handler_id', type: 'uuid' })
  handlerId!: string;

  @ManyToOne(() => User, (user) => user.moduleHandlers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'handler_id' })
  handler!: User;

  @Column({ type: 'int', default: 1 })
  weight!: number;

  @Column({ name: 'is_backup', type: 'boolean', default: false })
  isBackup!: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'rr_cursor_version', type: 'int', default: 0 })
  rrCursorVersion!: number;
}
