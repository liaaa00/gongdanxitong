import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('detail_view_templates')
export class DetailViewTemplate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'template_name', length: 100 })
  templateName!: string;

  @Column({ name: 'module_code', length: 50 })
  moduleCode!: string;

  @Column({ name: 'field_list', type: 'jsonb' })
  fieldList!: Array<Record<string, unknown>>;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
