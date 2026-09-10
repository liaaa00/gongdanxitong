import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { PortalNotificationSetting } from 'src/entities/portal-notification-setting.entity';
import { OperationLog } from 'src/entities';
import { DEFAULT_PORTAL_NOTIFICATION_CONFIG, mergeNotificationConfig, PortalNotificationConfig, PortalNotificationKind, renderNotification, validateDate, WorkdayOverrides } from './portal-notification.config';

const SETTINGS_ID = '00000000-0000-4000-8000-000000000001';

@Injectable()
export class PortalNotificationSettingsService {
  constructor(private readonly dataSource: DataSource) {}
  async get(manager: EntityManager = this.dataSource.manager): Promise<{ settings: PortalNotificationConfig; calendar: WorkdayOverrides }> {
    const row = await manager.getRepository(PortalNotificationSetting).findOne({ where: { id: SETTINGS_ID } });
    return { settings: mergeNotificationConfig(DEFAULT_PORTAL_NOTIFICATION_CONFIG, row?.settings ?? {}), calendar: row?.calendar ?? {} };
  }
  async saveSettings(input: Record<string, unknown>, userId: string) {
    return this.change(userId, async (current) => ({ ...current, settings: mergeNotificationConfig(current.settings, input) }), 'portal_notification_settings_update');
  }
  async saveCalendar(days: Array<{ date: string; isWorkday: boolean; label?: string }>, userId: string) {
    if (!Array.isArray(days) || days.length < 1 || days.length > 366) throw new BadRequestException('一次请维护1至366个日历日期');
    const seen = new Set<string>();
    for (const day of days) {
      validateDate(day.date);
      if (seen.has(day.date) || typeof day.isWorkday !== 'boolean' || (day.label !== undefined && (typeof day.label !== 'string' || day.label.length > 100))) throw new BadRequestException('日历包含重复日期或无效工作日、备注');
      seen.add(day.date);
    }
    return this.change(userId, async (current) => ({ ...current, calendar: { ...current.calendar, ...Object.fromEntries(days.map((day) => [day.date, { isWorkday: day.isWorkday, label: day.label?.trim() || '' }])) } }), 'portal_notification_calendar_update');
  }
  async removeCalendar(date: string, userId: string) {
    validateDate(date);
    return this.change(userId, async (current) => { const calendar = { ...current.calendar }; delete calendar[date]; return { ...current, calendar }; }, 'portal_notification_calendar_reset');
  }
  async render(kind: PortalNotificationKind, variables: Record<string, string>, manager?: EntityManager) { return renderNotification((await this.get(manager)).settings, kind, variables); }
  private async change(userId: string, apply: (value: Awaited<ReturnType<PortalNotificationSettingsService['get']>>) => Promise<Awaited<ReturnType<PortalNotificationSettingsService['get']>>>, actionType: string) {
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['portal-notification-settings']);
      const before = await this.get(manager);
      const after = await apply(before);
      const repository = manager.getRepository(PortalNotificationSetting);
      await repository.save(repository.create({ id: SETTINGS_ID, settings: after.settings as unknown as Record<string, unknown>, calendar: after.calendar }));
      const logs = manager.getRepository(OperationLog);
      await logs.save(logs.create({ entityType: 'portal_notification_settings', entityId: SETTINGS_ID, userId, actionType, beforeData: before as unknown as Record<string, unknown>, afterData: after as unknown as Record<string, unknown>, ipAddress: null }));
      return after;
    });
  }
}
