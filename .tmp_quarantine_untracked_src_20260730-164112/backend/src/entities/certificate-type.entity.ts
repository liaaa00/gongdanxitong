import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('certificate_types')
export class CertificateType {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100, unique: true, comment: '证明类型名称' })
  name!: string;

  @Column({ type: 'text', nullable: true, comment: '证明类型描述' })
  description?: string;

  @Column({ name: 'display_order', type: 'int', default: 0, comment: '排序，数字越小越靠前' })
  displayOrder!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true, comment: '是否启用' })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', comment: '更新时间' })
  updatedAt!: Date;
}
