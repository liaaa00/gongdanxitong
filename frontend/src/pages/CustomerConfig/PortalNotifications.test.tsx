import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigProvider } from 'antd';
import PortalNotifications from './PortalNotifications';
import { getNotificationCalendar, getNotificationConfig, getNotificationQueue, NOTIFICATION_KINDS, previewSchedule } from '@/services/portalOperations';

vi.mock('@/services/portalOperations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/portalOperations')>();
  return { ...actual, getNotificationCalendar: vi.fn(), getNotificationConfig: vi.fn(), getNotificationQueue: vi.fn(), previewSchedule: vi.fn() };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getNotificationConfig).mockResolvedValue({
    settings: {
      enabled: true, accountNoticeEnabled: true, monthlyEnabled: true, reminderEnabled: true,
      sendHour: 9, portalUrl: '', signature: '',
      templates: Object.fromEntries(NOTIFICATION_KINDS.map((kind) => [kind, { subject: '测试主题', body: '测试正文' }])) as Awaited<ReturnType<typeof getNotificationConfig>>['settings']['templates'],
    },
    templateVariables: [], reminderOffsets: [3, 2, 1], timezone: 'Asia/Shanghai', transportEnabled: false, transportConfigured: false,
  });
  vi.mocked(getNotificationCalendar).mockResolvedValue({ year: 2026, days: [] });
  vi.mocked(getNotificationQueue).mockResolvedValue({ list: [], total: 0 });
  vi.mocked(previewSchedule).mockResolvedValue({ billingDate: '2026-09-28', salaryMonth: '2026-09', reminders: [] });
});
afterEach(cleanup);

describe('通知日历输入边界', () => {
  it('日历说明限制 100 字，账单日越界输入在预览前收敛到 28', async () => {
    render(<ConfigProvider theme={{ token: { motion: false } }}><PortalNotifications /></ConfigProvider>);
    expect(screen.getByLabelText('账号开通通知 · 主题')).toHaveAttribute('maxlength', '200');
    fireEvent.click(screen.getByRole('tab', { name: '工作日历与提醒日期' }));
    const label = await screen.findByLabelText('说明');
    expect(label).toHaveAttribute('maxlength', '100');
    await userEvent.type(label, 'a'.repeat(101));
    expect(label).toHaveValue('a'.repeat(100));
    const day = screen.getByRole('spinbutton', { name: '预览账单日' });
    expect(day).toHaveAttribute('aria-valuemax', '28');
    fireEvent.change(day, { target: { value: '31' } });
    fireEvent.blur(day);
    fireEvent.click(screen.getByRole('button', { name: '计算提醒日期' }));
    await waitFor(() => expect(previewSchedule).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), 28, 'current'));
  }, 30_000);
});
