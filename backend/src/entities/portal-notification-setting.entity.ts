import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'portal_notification_settings' })
export class PortalNotificationSetting {
  @PrimaryColumn({ type: 'uuid' }) id!: string;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) settings!: Record<string, unknown>;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) calendar!: Record<string, { isWorkday: boolean; label: string }>;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
