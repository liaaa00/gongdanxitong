import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PortalNotificationsController } from 'src/modules/portal-notifications/portal-notifications.controller';
import { SavePortalCalendarDto, SavePortalNotificationSettingsDto } from 'src/modules/portal-notifications/portal-notifications.dto';
import { PortalNotificationSettingsService } from 'src/modules/portal-notifications/portal-notification-settings.service';
import { DEFAULT_PORTAL_NOTIFICATION_CONFIG } from 'src/modules/portal-notifications/portal-notification.config';
import { OperationLog, PortalNotificationSetting } from 'src/entities';

describe('Portal notification administration', () => {
  it('allows business roles to inspect queues but restricts shared templates and calendar mutation to admins', () => {
    const reflector = new Reflector();
    const roles = (method: keyof PortalNotificationsController) => reflector.getAllAndOverride('roles', [PortalNotificationsController.prototype[method], PortalNotificationsController]);
    expect(roles('queue')).toEqual(expect.arrayContaining(['admin', 'biz_member']));
    expect(roles('queue')).not.toContain('social_security_member');
    for (const method of ['saveSettings', 'saveCalendar', 'resetCalendar'] as const) expect(roles(method)).toEqual(['admin']);
  });
  it('validates nested dates and rejects attempts to change fixed reminder offsets through DTO', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    await expect(pipe.transform({ reminderOffsets: [1] }, { type: 'body', metatype: SavePortalNotificationSettingsDto })).rejects.toThrow();
    await expect(pipe.transform({ days: [{ date: '2026-09-10', isWorkday: 'true' }] }, { type: 'body', metatype: SavePortalCalendarDto })).rejects.toThrow();
    await expect(pipe.transform({ days: [{ date: '2026-09-10', isWorkday: false, extra: true }] }, { type: 'body', metatype: SavePortalCalendarDto })).rejects.toThrow();
    await expect(pipe.transform({ days: [{ date: '2026-09-10', isWorkday: false, label: '休息' }] }, { type: 'body', metatype: SavePortalCalendarDto })).resolves.toMatchObject({ days: [{ isWorkday: false }] });
  });
  it('returns transport readiness without disclosing SMTP credentials', async () => {
    const controller = new PortalNotificationsController({} as any, { get: async () => ({ settings: DEFAULT_PORTAL_NOTIFICATION_CONFIG }) } as any, { get: () => ({ enabled: false, host: 'smtp.test', from: 'service@example.test', port: 465, pass: 'private-secret' }) } as any);
    const result = await controller.getSettings();
    expect(result).toMatchObject({ reminderOffsets: [3, 2, 1], transportEnabled: false, transportConfigured: true, timezone: 'Asia/Shanghai' });
    expect(JSON.stringify(result)).not.toContain('private-secret');
  });
  it('persists calendar changes with a lock, keeps other overrides and audits settings by a real UUID', async () => {
    let stored: any = null;
    const logs: any[] = [];
    const manager: any = { query: jest.fn(async () => []), getRepository: (type: any) => {
      if (type === PortalNotificationSetting) return { findOne: async () => stored, create: (value: any) => value, save: async (value: any) => { stored = value; return value; } };
      if (type === OperationLog) return { create: (value: any) => value, save: async (value: any) => logs.push(value) };
      throw new Error('unexpected entity');
    } };
    const service = new PortalNotificationSettingsService({ manager, transaction: async (fn: any) => fn(manager) } as any);
    await service.saveCalendar([{ date: '2026-10-01', isWorkday: false, label: '国庆' }], 'admin');
    await service.saveCalendar([{ date: '2026-10-10', isWorkday: true, label: '调休' }], 'admin');
    await service.saveSettings({ signature: '客户服务' }, 'admin');
    expect(stored.calendar).toEqual({ '2026-10-01': { isWorkday: false, label: '国庆' }, '2026-10-10': { isWorkday: true, label: '调休' } });
    await service.removeCalendar('2026-10-01', 'admin');
    expect(stored.calendar).not.toHaveProperty('2026-10-01');
    expect(stored.settings.signature).toBe('客户服务');
    expect(logs[0].entityId).toBe('00000000-0000-4000-8000-000000000001');
    expect(manager.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtext($1))', ['portal-notification-settings']);
    await expect(service.saveCalendar([{ date: '2026-02-30', isWorkday: false }], 'admin')).rejects.toThrow('不存在');
    await expect(service.saveCalendar([{ date: '2026-10-01', isWorkday: true }, { date: '2026-10-01', isWorkday: false }], 'admin')).rejects.toThrow('重复日期');
  });
});
