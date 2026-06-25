/* eslint-disable @typescript-eslint/no-explicit-any */
import { DataSource } from 'typeorm';

type NotificationChannel = 'in_app' | 'email' | 'sms';

interface NotificationTemplateSeed {
  bizType: string;
  titleTemplate: string;
  contentTemplate: string;
  defaultLink: string | null;
  defaultPriority: 'low' | 'normal' | 'high';
  defaultChannels: NotificationChannel[];
  variables: Record<string, unknown>;
}

const OBJECT_BASE = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
} as const;

export const notificationTemplateSeeds: NotificationTemplateSeed[] = [
  {
    bizType: 'dispatched_new',
    titleTemplate: '新子工单待接单 · {{module}}',
    contentTemplate: '{{employeeName}} 的 {{orderTypeName}} 工单已派给你，工单号 {{orderNo}}。',
    defaultLink: '/my-dispatched/{{dispatchedOrderId}}',
    defaultPriority: 'normal',
    defaultChannels: ['in_app'],
    variables: {
      ...OBJECT_BASE,
      required: ['dispatchedOrderId', 'module', 'orderNo', 'employeeName', 'orderTypeName'],
      properties: {
        dispatchedOrderId: { type: 'string' },
        module: { type: 'string' },
        orderNo: { type: 'string' },
        employeeName: { type: 'string' },
        orderTypeName: { type: 'string' },
      },
      additionalProperties: true,
    },
  },
  {
    bizType: 'dispatched_returned_to_salesperson',
    titleTemplate: '工单 {{orderNo}} 被 {{moduleName}} 退回',
    contentTemplate: '退回原因：{{returnReason}}。请尽快修改后重新提交。',
    defaultLink: '/my-dispatched/{{dispatchedOrderId}}',
    defaultPriority: 'high',
    defaultChannels: ['in_app', 'email'],
    variables: {
      ...OBJECT_BASE,
      required: ['orderNo', 'moduleName', 'returnReason'],
      properties: {
        dispatchedOrderId: { type: 'string' },
        workOrderId: { type: 'string' },
        orderNo: { type: 'string' },
        moduleName: { type: 'string' },
        returnReason: { type: 'string', maxLength: 500 },
      },
      additionalProperties: true,
    },
  },
  {
    bizType: 'field_supplemented',
    titleTemplate: '工单 {{orderNo}} 字段已由 {{moduleName}} 补充',
    contentTemplate: '字段：{{fieldNames}}。请在详情页确认。',
    defaultLink: '/work-orders/{{workOrderId}}',
    defaultPriority: 'normal',
    defaultChannels: ['in_app'],
    variables: {
      ...OBJECT_BASE,
      required: ['workOrderId', 'orderNo', 'moduleName', 'fieldNames'],
      properties: {
        workOrderId: { type: 'string' },
        orderNo: { type: 'string' },
        moduleName: { type: 'string' },
        fieldNames: { type: 'string', description: '以顿号分隔的字段中文名列表' },
        count: { type: 'integer', minimum: 1 },
      },
      additionalProperties: true,
    },
  },
  {
    bizType: 'work_order_completed',
    titleTemplate: '工单 {{orderNo}} 已完成',
    contentTemplate: '{{employeeName}} 的 {{orderTypeName}} 工单已由所有后道模块办结。',
    defaultLink: '/work-orders/{{workOrderId}}',
    defaultPriority: 'low',
    defaultChannels: ['in_app'],
    variables: {
      ...OBJECT_BASE,
      required: ['workOrderId', 'orderNo', 'employeeName', 'orderTypeName'],
      properties: {
        workOrderId: { type: 'string' },
        orderNo: { type: 'string' },
        employeeName: { type: 'string' },
        orderTypeName: { type: 'string' },
      },
      additionalProperties: true,
    },
  },
  {
    bizType: 'sla_warning',
    titleTemplate: '【即将超时】{{moduleName}} · 工单 {{orderNo}}',
    contentTemplate: '该子工单即将到达办理时限，请尽快处理。',
    defaultLink: '/my-dispatched/{{dispatchedOrderId}}',
    defaultPriority: 'high',
    defaultChannels: ['in_app', 'email'],
    variables: {
      ...OBJECT_BASE,
      required: ['dispatchedOrderId', 'orderNo', 'moduleName'],
      properties: {
        dispatchedOrderId: { type: 'string' },
        orderNo: { type: 'string' },
        moduleName: { type: 'string' },
        elapsedHours: { type: 'number', minimum: 0 },
        thresholdHours: { type: 'number', minimum: 0 },
      },
      additionalProperties: true,
    },
  },
  {
    bizType: 'sla_breach',
    titleTemplate: '【已超时】{{moduleName}} · 工单 {{orderNo}}',
    contentTemplate: '该子工单已超过办理时限，请立即处理。',
    defaultLink: '/my-dispatched/{{dispatchedOrderId}}',
    defaultPriority: 'high',
    defaultChannels: ['in_app', 'email'],
    variables: {
      ...OBJECT_BASE,
      required: ['dispatchedOrderId', 'orderNo', 'moduleName'],
      properties: {
        dispatchedOrderId: { type: 'string' },
        orderNo: { type: 'string' },
        moduleName: { type: 'string' },
        elapsedHours: { type: 'number', minimum: 0 },
        thresholdHours: { type: 'number', minimum: 0 },
      },
      additionalProperties: true,
    },
  },
  {
    bizType: 'password_reset_by_admin',
    titleTemplate: '您的密码已被管理员重置',
    contentTemplate: '管理员 {{operatorName}} 于 {{resetAt}} 重置了您的登录密码，请使用临时密码登录后立即修改。',
    defaultLink: '/profile/security',
    defaultPriority: 'high',
    defaultChannels: ['in_app', 'email'],
    variables: {
      ...OBJECT_BASE,
      required: ['operatorName', 'resetAt'],
      properties: {
        operatorName: { type: 'string' },
        resetAt: { type: 'string' },
        requireChange: { type: 'boolean', default: true },
      },
      additionalProperties: true,
    },
  },
  {
    bizType: 'assigned_as_supervisor',
    titleTemplate: '您已被指定为 {{moduleName}} 主管',
    contentTemplate: '生效部门：{{departmentName}}；指派人：{{operatorName}}。请在工作台确认团队范围。',
    defaultLink: '/team-dispatched?module={{module}}',
    defaultPriority: 'normal',
    defaultChannels: ['in_app'],
    variables: {
      ...OBJECT_BASE,
      required: ['module', 'moduleName', 'departmentName', 'operatorName'],
      properties: {
        module: { type: 'string' },
        moduleName: { type: 'string' },
        departmentName: { type: 'string' },
        operatorName: { type: 'string' },
      },
      additionalProperties: true,
    },
  },
  {
    bizType: 'user_welcome',
    titleTemplate: '欢迎加入，{{realName}}',
    contentTemplate: '您的账号 {{username}} 已创建，首次登录后请修改密码。初始角色：{{roleNames}}。',
    defaultLink: '/profile',
    defaultPriority: 'normal',
    defaultChannels: ['in_app', 'email'],
    variables: {
      ...OBJECT_BASE,
      required: ['username', 'realName', 'roleNames'],
      properties: {
        username: { type: 'string' },
        realName: { type: 'string' },
        roleNames: { type: 'string', description: '以顿号分隔的角色中文名' },
        initialPassword: { type: 'string' },
      },
      additionalProperties: true,
    },
  },
  {
    bizType: 'import_done',
    titleTemplate: '导入任务 #{{jobId}} 已完成',
    contentTemplate: '成功 {{successRows}} / 总 {{totalRows}}，失败 {{failRows}}。点击查看详情。',
    defaultLink: '/work-orders/import/{{jobId}}',
    defaultPriority: 'normal',
    defaultChannels: ['in_app'],
    variables: {
      ...OBJECT_BASE,
      required: ['jobId', 'totalRows', 'successRows', 'failRows'],
      properties: {
        jobId: { type: 'string' },
        totalRows: { type: 'integer', minimum: 0 },
        successRows: { type: 'integer', minimum: 0 },
        failRows: { type: 'integer', minimum: 0 },
        errorReportUrl: { type: ['string', 'null'] },
      },
      additionalProperties: true,
    },
  },
  {
    bizType: 'import_failed',
    titleTemplate: '导入任务 #{{jobId}} 失败',
    contentTemplate: '错误摘要：{{errorSummary}}。请检查 Excel 后重新上传。',
    defaultLink: '/work-orders/import/{{jobId}}',
    defaultPriority: 'high',
    defaultChannels: ['in_app', 'email'],
    variables: {
      ...OBJECT_BASE,
      required: ['jobId', 'errorSummary'],
      properties: {
        jobId: { type: 'string' },
        errorSummary: { type: 'string', maxLength: 500 },
        errorReportUrl: { type: ['string', 'null'] },
      },
      additionalProperties: true,
    },
  },
  {
    bizType: 'system_announcement',
    titleTemplate: '【系统公告】{{title}}',
    contentTemplate: '{{content}}',
    defaultLink: '{{link}}',
    defaultPriority: 'normal',
    defaultChannels: ['in_app'],
    variables: {
      ...OBJECT_BASE,
      required: ['title', 'content'],
      properties: {
        title: { type: 'string', maxLength: 120 },
        content: { type: 'string', maxLength: 4000 },
        link: { type: ['string', 'null'] },
      },
      additionalProperties: true,
    },
  },
];

export async function seedNotificationTemplates(dataSource: DataSource): Promise<void> {
  for (const seed of notificationTemplateSeeds) {
    await dataSource.query(
      `
      INSERT INTO notification_templates
        (biz_type, title_template, content_template, default_link,
         default_priority, default_channels, variables, is_active,
         created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, true, now(), now())
      ON CONFLICT (biz_type) DO NOTHING
      `,
      [
        seed.bizType,
        seed.titleTemplate,
        seed.contentTemplate,
        seed.defaultLink,
        seed.defaultPriority,
        JSON.stringify(seed.defaultChannels),
        JSON.stringify(seed.variables),
      ],
    );
  }
}
