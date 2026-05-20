import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'system_settings' })
export class SystemSetting {
  @PrimaryColumn({ name: 'key', type: 'varchar', length: 64 })
  key!: string;

  @Column({ name: 'value', type: 'text' })
  value!: string;

  @Column({ name: 'is_encrypted', type: 'boolean', default: false })
  isEncrypted!: boolean;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
