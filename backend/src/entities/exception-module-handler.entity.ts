import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DispatchModuleCode } from './enums';
import { User } from './user.entity';

@Entity({ name: 'exception_module_handlers' })
@Index('uq_exception_module_handlers_module_customer', ['moduleCode', 'customerCode'], { unique: true })
export class ExceptionModuleHandler {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    name: 'module_code',
    type: 'enum',
    enum: DispatchModuleCode,
  })
  moduleCode!: DispatchModuleCode;

  @Column({ name: 'customer_code', type: 'varchar', length: 64 })
  customerCode!: string;

  @Column({ name: 'handler_id', type: 'uuid' })
  handlerId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'handler_id' })
  handler!: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
