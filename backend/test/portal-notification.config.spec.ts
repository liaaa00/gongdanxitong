import { chinaDate, DEFAULT_PORTAL_NOTIFICATION_CONFIG, mergeNotificationConfig, reminderDates, renderNotification, salaryPeriod, validateDate } from 'src/modules/portal-notifications/portal-notification.config';

describe('Portal notification workdays and templates', () => {
  it('keeps 3/2/1 fixed and handles weekends, holidays and a working Sunday across years', () => {
    expect(reminderDates('2027-01-05', { '2027-01-01': { isWorkday: false, label: '元旦' }, '2027-01-03': { isWorkday: true, label: '调休上班' } })).toEqual([
      { date: '2026-12-31', offset: 3 }, { date: '2027-01-03', offset: 2 }, { date: '2027-01-04', offset: 1 },
    ]);
    expect(salaryPeriod('2027-01', 'previous')).toBe('2026-12');
    expect(chinaDate(new Date('2026-12-31T16:00:00Z'))).toBe('2027-01-01');
    expect(() => mergeNotificationConfig(DEFAULT_PORTAL_NOTIFICATION_CONFIG, { reminderOffsets: [5, 3, 1] })).toThrow('固定');
  });
  it.each(['2026-02-30', '2026-13-01', '1999-12-31', '2026-1-1', 'not-date'])('rejects invalid calendar date %s', (value) => {
    expect(() => validateDate(value)).toThrow();
  });
  it('renders only approved variables, preserves custom signatures and removes header newlines', () => {
    const config = mergeNotificationConfig(DEFAULT_PORTAL_NOTIFICATION_CONFIG, { signature: '服务团队', templates: { salary_monthly: { subject: '{{customer_name}} {{salary_month}}', body: '登录{{portal_url}}' } } });
    expect(renderNotification(config, 'salary_monthly', { customer_name: '客户\r\nBcc: fake', salary_month: '2027-01' })).toEqual({ subject: '客户  Bcc: fake 2027-01', body: '登录请联系业务员获取门户访问地址\n\n服务团队' });
  });
  it.each(['password', 'token', 'passwordHash', 'access_token'])('rejects secret variable %s', (key) => {
    expect(() => mergeNotificationConfig(DEFAULT_PORTAL_NOTIFICATION_CONFIG, { templates: { account_opened: { subject: '开通', body: `{{${key}}}` } } })).toThrow('不能进入邮件');
  });
  it.each(['https://portal.test/?token=secret', 'https://u:p@portal.test/', 'javascript:alert(1)', 'https://portal.test/#token'])('rejects a credential-bearing or unsafe portal URL %s', (portalUrl) => {
    expect(() => mergeNotificationConfig(DEFAULT_PORTAL_NOTIFICATION_CONFIG, { portalUrl })).toThrow();
  });
});
