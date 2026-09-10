import request from './request';
export const NOTIFICATION_KINDS = ['account_opened','salary_monthly','salary_reminder','salary_escalation','completion'] as const;
export type NotificationKind = typeof NOTIFICATION_KINDS[number];
export interface NotificationSettings { enabled:boolean;accountNoticeEnabled:boolean;monthlyEnabled:boolean;reminderEnabled:boolean;sendHour:number;portalUrl:string;signature:string;templates:Record<NotificationKind,{subject:string;body:string}> }
export interface NotificationConfig { settings:NotificationSettings;templateVariables:string[];reminderOffsets:number[];timezone:string;transportEnabled:boolean;transportConfigured:boolean }
export interface CalendarDay {date:string;isWorkday:boolean;label:string}
export interface NotificationRow {id:string;subject:string;status:string;toRecipients:string[];lastError:string|null;attemptCount:number;createdAt:string}
export interface SchedulePreview {billingDate:string;salaryMonth:string;reminders:{date:string;offset:number}[]}
const notifications='/customer-portal-notifications';
export const getNotificationConfig=()=>request.get(`${notifications}/settings`) as Promise<NotificationConfig>;
export const saveNotificationConfig=(data:NotificationSettings)=>request.put(`${notifications}/settings`,data);
export const getNotificationCalendar=(year:number)=>request.get(`${notifications}/calendar`,{params:{year}}) as Promise<{year:number;days:CalendarDay[]}>;
export const saveNotificationCalendar=(days:CalendarDay[])=>request.put(`${notifications}/calendar`,{days});
export const resetNotificationCalendar=(date:string)=>request.delete(`${notifications}/calendar/${date}`);
export const getNotificationQueue=(page:number)=>request.get(`${notifications}/queue`,{params:{page,pageSize:20}}) as Promise<{list:NotificationRow[];total:number}>;
export const retryNotification=(id:string)=>request.post(`${notifications}/queue/${id}/retry`);
export const previewNotification=(kind:NotificationKind)=>request.post(`${notifications}/preview`,{kind,variables:{customer_name:'示例客户',contact_name:'客户联系人',login_email:'example@example.test',salary_month:'2026-09',billing_date:'2026-09-20',workdays_left:'3',order_no:'示例受理编号',employee_name:'示例员工',business_type:'增员',objection_notice:'请按约定反馈异议。'}}) as Promise<{subject:string;body:string}>;
export const previewSchedule=(date:string,billingDay:number,payrollMonthMode:'current'|'previous')=>request.get(`${notifications}/schedule-preview`,{params:{date,billingDay,payrollMonthMode}}) as Promise<SchedulePreview>;
export interface MonitorRow {id:string;requestKey:string;action:string;businessType:string|null;status:string;gatewayReceivedAt:string|null;connectorReceivedAt:string|null;backendReceivedAt:string|null;acceptedAt:string|null;completedAt:string|null;portalRespondedAt:string|null;resultReturnedAt:string|null;failureCode:string|null;submissionCount:number;completedCount:number;returnedCount:number}
export interface MonitorSummary {connection:{status:string;label:string;lastHeartbeatAt:string|null};total:number;counts:Record<string,number>}
export interface MonitorDetail extends MonitorRow {events:{stage:string;at:string;failureCode?:string|null}[];submissions:{id:string;requestNo:string;businessType:string;status:string}[]}
export const getMonitorSummary=()=>request.get('/customer-portal-monitor/summary') as Promise<MonitorSummary>;
export const getMonitorRequests=(page:number,status?:string,businessType?:string)=>request.get('/customer-portal-monitor/requests',{params:{page,pageSize:20,status,businessType}}) as Promise<{list:MonitorRow[];total:number}>;
export const getMonitorDetail=(id:string)=>request.get(`/customer-portal-monitor/requests/${id}`) as Promise<MonitorDetail>;
