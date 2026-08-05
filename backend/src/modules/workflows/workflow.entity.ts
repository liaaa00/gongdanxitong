import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrderType, BusinessScope } from 'src/entities/enums';
import { User } from 'src/entities/user.entity';

export enum WorkflowDefinitionStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

@Entity({ name: 'workflow_definitions' })
export class WorkflowDefinition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Column({ name: 'order_type', type: 'enum', enum: OrderType, enumName: 'order_type_enum', nullable: true })
  orderType!: OrderType | null;

  @Column({ name: 'business_scope', type: 'varchar', length: 32, default: 'beilun' })
  businessScope!: BusinessScope;

  @Column({ name: 'flow_key', type: 'varchar', length: 64, nullable: true })
  flowKey!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  description!: string | null;

  @Column({ name: 'definition_json', type: 'jsonb' })
  definitionJson!: Record<string, unknown>;

  @Column({ name: 'published_definition_json', type: 'jsonb', nullable: true })
  publishedDefinitionJson!: Record<string, unknown> | null;

  @Column({ type: 'integer', default: 0 })
  version!: number;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @Column({
    type: 'enum',
    enum: WorkflowDefinitionStatus,
    enumName: 'workflow_definition_status_enum',
    default: WorkflowDefinitionStatus.DRAFT,
  })
  status!: WorkflowDefinitionStatus;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  creator!: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
