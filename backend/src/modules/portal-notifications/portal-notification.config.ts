import { BadRequestException } from '@nestjs/common';

export const NOTIFICATION_KINDS = ['account_opened', 'salary_monthly', 'salary_reminder', 'salary_escalation', 'completion'] as const;
export type PortalNotificationKind = typeof NOTIFICATION_KINDS[number];
export type WorkdayOverrides = Record<string, { isWorkday: boolean; label: string }>;
export interface PortalMailTemplate { subject: string; body: string }
export interface PortalNotificationConfig {
  enabled: boolean;
  accountNoticeEnabled: boolean;
  monthlyEnabled: boolean;
  reminderEnabled: boolean;
  sendHour: number;
  portalUrl: string;
  signature: string;
  templates: Record<PortalNotificationKind, PortalMailTemplate>;
}
export const TEMPLATE_VARIABLES = ['customer_name', 'contact_name', 'login_email', 'portal_url', 'permissions', 'salary_month', 'billing_date', 'workdays_left', 'order_no', 'employee_name', 'business_type', 'objection_notice', 'signature'] as const;
export const DEFAULT_PORTAL_NOTIFICATION_CONFIG: PortalNotificationConfig = {
  enabled: true, accountNoticeEnabled: true, monthlyEnabled: true, reminderEnabled: true, sendHour: 9, portalUrl: '', signature: '外服客户服务团队',
  templates: {
    account_opened: { subject: '{{customer_name}}客户门户账号已开通', body: '{{contact_name}}，您好：\n您的客户门户账号已开通或重新启用。\n登录邮箱：{{login_email}}\n业务权限：{{permissions}}\n门户地址：{{portal_url}}\n初始密码请通过双方约定的安全渠道向业务员获取；首次登录请按页面提示修改密码。忘记密码请联系业务员重置。\n\n{{signature}}' },
    salary_monthly: { subject: '{{customer_name}} {{salary_month}}薪资信息收集', body: '您好：\n请登录客户门户确认{{salary_month}}薪资情况；无变动也请提交确认，有变动可填写说明或上传文件。\n门户地址：{{portal_url}}\n\n{{signature}}' },
    salary_reminder: { subject: '{{customer_name}} {{salary_month}}薪资信息待提交', body: '您好：\n暂未收到{{salary_month}}薪资确认。距账单日{{billing_date}}还有{{workdays_left}}个工作日，请及时登录门户提交。已提交后不再发送本期催办提醒。\n门户地址：{{portal_url}}\n\n{{signature}}' },
    salary_escalation: { subject: '{{customer_name}} {{salary_month}}薪资收集需跟进', body: '业务同事您好：\n客户{{customer_name}}尚未提交{{salary_month}}薪资信息，距账单日{{billing_date}}还有1个工作日，请及时联系客户。\n\n{{signature}}' },
    completion: { subject: '工单{{order_no}}办结结果确认', body: '您好，工单{{order_no}}已办理完成。\n员工：{{employee_name}}\n详细办理结果请查看邮件附件《办结结果确认》。\n{{objection_notice}}\n\n{{signature}}' },
  },
};

export function validateDate(value: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value) || Number(value.slice(0, 4)) < 2000 || Number(value.slice(0, 4)) > 2100) throw new BadRequestException('日期须为2000至2100年的 YYYY-MM-DD');
  const date = new Date(value + 'T12:00:00Z');
  if (date.toISOString().slice(0, 10) !== value) throw new BadRequestException('日期不存在');
  return value;
}

export function chinaDate(now = new Date()): string { return now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }); }
export function shiftMonth(month: string, amount: number): string {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 + amount, 1)).toISOString().slice(0, 7);
}
export function salaryPeriod(billingMonth: string, mode?: 'current' | 'previous'): string { return shiftMonth(billingMonth, mode === 'previous' ? -1 : 0); }
export function isWorkingDay(date: string, calendar: WorkdayOverrides): boolean {
  if (calendar[date]) return calendar[date].isWorkday;
  const day = new Date(date + 'T12:00:00Z').getUTCDay();
  return day !== 0 && day !== 6;
}
export function reminderDates(billingDate: string, calendar: WorkdayOverrides): Array<{ date: string; offset: 3 | 2 | 1 }> {
  validateDate(billingDate);
  const current = new Date(billingDate + 'T12:00:00Z');
  const result: Array<{ date: string; offset: 3 | 2 | 1 }> = [];
  for (let scanned = 0; scanned < 370 && result.length < 3; scanned += 1) {
    current.setUTCDate(current.getUTCDate() - 1);
    const date = current.toISOString().slice(0, 10);
    if (isWorkingDay(date, calendar)) result.push({ date, offset: (result.length + 1) as 1 | 2 | 3 });
  }
  if (result.length < 3) throw new BadRequestException('工作日日历连续休息过长，无法计算提醒日');
  return result.reverse();
}

export function mergeNotificationConfig(current: PortalNotificationConfig, input: Record<string, unknown>): PortalNotificationConfig {
  const allowed = new Set(Object.keys(DEFAULT_PORTAL_NOTIFICATION_CONFIG));
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new BadRequestException('通知设置包含未知字段，提醒节奏固定为3/2/1工作日');
  const result = { ...current, templates: { ...current.templates } };
  for (const key of ['enabled', 'accountNoticeEnabled', 'monthlyEnabled', 'reminderEnabled'] as const) {
    if (input[key] !== undefined) { if (typeof input[key] !== 'boolean') throw new BadRequestException('通知开关必须为布尔值'); result[key] = input[key]; }
  }
  if (input.sendHour !== undefined) { if (!Number.isInteger(input.sendHour) || Number(input.sendHour) < 0 || Number(input.sendHour) > 23) throw new BadRequestException('发送时间必须为0至23点'); result.sendHour = Number(input.sendHour); }
  for (const key of ['portalUrl', 'signature'] as const) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== 'string' || input[key].length > (key === 'signature' ? 1000 : 500)) throw new BadRequestException('门户地址或签名格式错误');
    result[key] = input[key].trim();
  }
  if (result.portalUrl) {
    let url: URL; try { url = new URL(result.portalUrl); } catch { throw new BadRequestException('门户地址必须为有效网址'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new BadRequestException('门户地址仅允许不含凭据或令牌的HTTP/HTTPS网址');
  }
  if (input.templates !== undefined) {
    if (!input.templates || typeof input.templates !== 'object' || Array.isArray(input.templates)) throw new BadRequestException('邮件模板格式错误');
    for (const [kind, template] of Object.entries(input.templates)) {
      if (!(NOTIFICATION_KINDS as readonly string[]).includes(kind) || !template || typeof template !== 'object' || Array.isArray(template)) throw new BadRequestException('邮件模板类型错误');
      const value = template as Record<string, unknown>;
      if (Object.keys(value).some((key) => !['subject', 'body'].includes(key)) || typeof value.subject !== 'string' || typeof value.body !== 'string' || !value.subject.trim() || !value.body.trim() || value.subject.length > 200 || value.body.length > 10000 || /[\r\n]/.test(value.subject)) throw new BadRequestException('邮件主题或正文格式错误');
      const combined = value.subject + '\n' + value.body;
      for (const match of combined.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) if (!(TEMPLATE_VARIABLES as readonly string[]).includes(match[1].trim())) throw new BadRequestException(`不支持模板变量：${match[1]}，密码及令牌不能进入邮件`);
      if (/\{\{|\}\}/.test(combined.replace(/\{\{\s*[^{}]+?\s*\}\}/g, ''))) throw new BadRequestException('模板变量格式不完整');
      result.templates[kind as PortalNotificationKind] = { subject: value.subject.trim(), body: value.body.trim() };
    }
  }
  return result;
}

export function renderNotification(config: PortalNotificationConfig, kind: PortalNotificationKind, variables: Record<string, string>): PortalMailTemplate {
  const template = config.templates[kind];
  const values: Record<string, string> = { ...variables, portal_url: config.portalUrl || '请联系业务员获取门户访问地址', signature: config.signature };
  const render = (value: string) => value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, key: string) => String(values[key.trim()] ?? ''));
  const body = render(template.body);
  return { subject: render(template.subject).replace(/[\r\n]/g, ' ').slice(0, 255), body: /\{\{\s*signature\s*\}\}/.test(template.body) || !config.signature ? body : `${body}\n\n${config.signature}` };
}
