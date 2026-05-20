/* eslint-disable @typescript-eslint/no-explicit-any */
import { DataSource } from 'typeorm';

/**
 * seed-notification-templates.ts
 *
 * 为 Phase 6 `notification_templates` 表写入 13 条默认模板。架构师约束：
 *   - 表结构：id, biz_type (UK), title_template, content_template,
 *     default_link, default_priority, default_channels (jsonb), variables (jsonb),
 *     is_active, created_at, updated_at
 *   - 模板渲染使用 Mustache，仅支持 `{{var}}` 变量替换；禁止执行逻辑以免注入。
 *   - `default_channels` 取值：`in_app` / `email` / `sms`；本期仅 `in_app` 生效，其它通道为扩展位。
 *   - `variables` 为 Draft-2020-12 JSON Schema，用于 `NotificationService.send()` 做运行时变量校验。
 *
 * 架构变更说明（v1.2 候选）：
 *   - 本 seed 引入 4 个新 `biz_type`：`password_reset_by_admin`、`assigned_as_supervisor`、
 *     `user_welcome`、`system_announcement`。需同步更新 `docs/Phase6看板与通知设计.md` §6.3 枚举表，
 *     由架构师走 `[架构变更]` 广播后再合入。
 *   - 本 seed 在 `notification_templates` 上**新增两列** `default_channels`、`variables`，
 *     对应 ER 图 §4.9 的 Phase 6 扩展；migration 需同步 ALTER TABLE。
 *
 * 使用方式（backend 集成时）：
 *   - 先执行建表 migration（含上述两列）；
 *   - 在 `backend/src/database/seeds/index.ts` 中追加 `await seedNotificationTemplates(AppDataSource)`。
 */

type NotificationChannel = 'in_app' | 'email' | 'sms';

interface NotificationTemplateSeed {
  bizType: string;
  titleTemplate: string;
  contentTemplate: string;
  defaultLink: string | null;
  defaultPriority: 'low' | 'normal' | 'high';
  defaultChannels: NotificationChannel[];
  /** JSON Schema Draft 2020-12；描述模板所需变量的形状 */
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
        dispatchedOrderId: { type: 'integer' },
        module: { type: 'string', enum: ['contract', 'onboarding_contact', 'data_entry', 'renewal_contract', 'resignation_contact', 'resignation_cert', 'benefit_apply'] },
        orderNo: { type: 'string' },
        employeeName: { type: 'string' },
        orderTypeName: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    bizType: 'dispatched_returned_to_salesperson',
    titleTemplate: '工单 {{orderNo}} 被 {{moduleName}} 退回',
    contentTemplate: '退回原因：{{returnReason}}。请尽快修正后重新提交。',
    defaultLink: '/work-orders/{{workOrderId}}',
    defaultPriority: 'high',
    defaultChannels: ['in_app', 'email'],
    variables: {
      ...OBJECT_BASE,
      required: ['workOrderId', 'orderNo', 'moduleName', 'returnReason'],
      properties: {
        workOrderId: { type: 'integer' },
        orderNo: { type: 'string' },
        moduleName: { type: 'string' },
        returnReason: { type: 'string', maxLength: 500 },
      },
      additionalProperties: false,
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
        workOrderId: { type: 'integer' },
        orderNo: { type: 'string' },
        moduleName: { type: 'string' },
        fieldNames: { type: 'string', description: '以顿号分隔的字段中文名列表' },
        count: { type: 'integer', minimum: 1 },
      },
      additionalProperties: false,
    },
  },
  {
    bizType: 'work_order_completed',
    titleTemplate: '工单 {{orderNo}} 已完成',
    contentTemplate: '{{employeeName}} 的 {{orderTypeName}} 工单已由所有后道模块办结，可前往归档。',
    defaultLink: '/work-orders/{{workOrderId}}',
    defaultPriority: 'low',
    defaultChannels: ['in_app'],
    variables: {
      ...OBJECT_BASE,
      required: ['workOrderId', 'orderNo', 'employeeName', 'orderTypeName'],
      properties: {
        workOrderId: { type: 'integer' },
        orderNo: { type: 'string' },
        employeeName: { type: 'string' },
        orderTypeName: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    bizType: 'sla_breach',
    titleTemplate: '【SLA 即将超时】{{moduleName}} · 工单 {{orderNo}}',
    contentTemplate: '该子工单已派发 {{elapsedHours}} 小时，SLA 阈值 {{thresholdHours}} 小时。请尽快处理。',
    defaultLink: '/my-dispatched/{{dispatchedOrderId}}',
    defaultPriority: 'high',
    defaultChannels: ['in_app', 'email'],
    variables: {
      ...OBJECT_BASE,
      required: ['dispatchedOrderId', 'orderNo', 'moduleName', 'elapsedHours', 'thresholdHours'],
      properties: {
        dispatchedOrderId: { type: 'integer' },
        orderNo: { type: 'string' },
        moduleName: { type: 'string' },
        elapsedHours: { type: 'number', minimum: 0 },
        thresholdHours: { type: 'number', minimum: 0 },
      },
      additionalProperties: false,
    },
  },
  {
    bizType: 'password_reset_by_admin',
    titleTemplate: '您的密码已被管理员重置',
    contentTemplate: '管理员 {{operatorName}} 于 {{resetAt}} 重置了您的登录密码。请使用临时密码登录后立即修改。',
    defaultLink: '/profile/security',
    defaultPriority: 'high',
    defaultChannels: ['in_app', 'email'],
    variables: {
      ...OBJECT_BASE,
      required: ['operatorName', 'resetAt'],
      properties: {
        operatorName: { type: 'string' },
        resetAt: { type: 'string', format: 'date-time' },
        requireChange: { type: 'boolean', default: true },
      },
      additionalProperties: false,
    },
  },
  {
    bizType: 'assigned_as_supervisor',
    titleTemplate: '您已被指派为 {{moduleName}} 主管',
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
      additionalProperties: false,
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
        initialPassword: { type: 'string', description: '仅邮件渠道渲染时出现，in_app 不可携带' },
      },
      additionalProperties: false,
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
        jobId: { type: 'integer' },
        totalRows: { type: 'integer', minimum: 0 },
        successRows: { type: 'integer', minimum: 0 },
        failRows: { type: 'integer', minimum: 0 },
        errorReportUrl: { type: ['string', 'null'] },
      },
      additionalProperties: false,
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
        jobId: { type: 'integer' },
        errorSummary: { type: 'string', maxLength: 500 },
        errorReportUrl: { type: ['string', 'null'] },
      },
      additionalProperties: false,
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
      additionalProperties: false,
    },
  },
];

/**
 * 写入 notification_templates。使用原生 SQL 而非 Repository，以便：
 *   - 不依赖 NotificationTemplate TypeORM 实体（backend 正式加入前也可单测）。
 *   - upsert 语义：同 biz_type 已存在则更新文案/优先级/渠道/变量，不新建。
 */
export async function seedNotificationTemplates(dataSource: DataSource): Promise<void> {
  for (const seed of notificationTemplateSeeds) {
    await dataSource.query(
      `
      INSERT INTO notification_templates
        (biz_type, title_template, content_template, default_link,
         default_priority, default_channels, variables, is_active,
         created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, true, now(), now())
      ON CONFLICT (biz_type) DO UPDATE SET
        title_template   = EXCLUDED.title_template,
        content_template = EXCLUDED.content_template,
        default_link     = EXCLUDED.default_link,
        default_priority = EXCLUDED.default_priority,
        default_channels = EXCLUDED.default_channels,
        variables        = EXCLUDED.variables,
        is_active        = true,
        updated_at       = now()
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
