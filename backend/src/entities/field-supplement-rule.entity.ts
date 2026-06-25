import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'field_supplement_rules' })
export class FieldSupplementRule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'field_code', type: 'varchar', length: 128 })
  fieldCode!: string;

  @Column({ name: 'supplementer_module', type: 'varchar', length: 64 })
  supplementerModule!: string;

  @Column({ name: 'sync_to_modules', type: 'jsonb', nullable: true })
  syncToModules!: string[] | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
