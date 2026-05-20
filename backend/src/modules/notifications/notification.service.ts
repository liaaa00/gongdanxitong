import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { businessException } from 'src/common/exceptions/business-exception';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { toPageResult } from 'src/common/types/pagination.types';
import { Notification } from 'src/entities';
import { NotificationEventBus, NotificationStreamPayload } from './notification-event-bus';
import { MockEmailChannel } from './channels/mock-email.channel';
import { MockSmsChannel } from './channels/mock-sms.channel';
import { InAppNotificationChannel } from './channels/in-app.channel';
import { NotificationChannelType } from './channels/channel-dispatcher.interface';

interface NotificationTemplateDefinition {
  title: string;
  content: string;
  defaultLink: string | null;
  defaultChannels: NotificationChannelType[];
}

interface NotificationTemplateRow {
  biz_type: string;
  title_template: string;
  content_template: string;
  default_link: string | null;
  default_channels: unknown;
  is_active?: boolean;
}

export interface QueryNotificationsDto extends PaginationQueryDto {
  isRead?: boolean;
  unread?: boolean;
  bizType?: string;
  biz_type?: string;
  priority?: string;
  groupBy?: string;
  group_by?: string;
}

export interface NotificationListItem {
  id: string;
  bizType: string;
  biz_type?: string;
  type?: string;
  title: string;
  content: string;
  link: string | null;
  payload: Record<string, unknown> | null;
  isRead: boolean;
  is_read?: boolean;
  createdAt: Date;
  created_at?: Date;
  readAt: Date | null;
  priority?: string;
  entity_type?: string | null;
  entity_id?: string | null;
  ref_order_id?: string;
  ref_order_no?: string;
  order_no?: string;
  diff_summary?: string;
  diff_fields?: Array<{ field_code: string; field_name?: string; old_value?: unknown; new_value?: unknown }>;
}

export interface NotificationListResult {
  list: NotificationListItem[];
  items: NotificationListItem[];
  total: number;
  page: number;
  pageSize: number;
  groups?: Array<{
    bizType: string;
    total: number;
    unread: number;
    latestAt: Date | null;
    items: NotificationListItem[];
  }>;
}

export interface BulkNotificationInput {
  userId: string;
  bizType: string;
  title: string;
  content: string;
  link?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface SendNotificationInput {
  templateCode: string;
  recipients: string[];
  params: Record<string, unknown>;
  bizType?: string;
  link?: string | null;
  channels?: NotificationChannelType[];
  manager?: EntityManager;
}

@Injectable()
export class NotificationService {
  private readonly fallbackTemplates: Record<string, NotificationTemplateDefinition> = {
    dispatch: {
      title: '新子工单待处理',
      content: '主工单 {{orderNo}} 已分派到 {{moduleName}}。',
      defaultLink: '/dispatched-orders/{{dispatchedOrderId}}',
      defaultChannels: ['in_app'],
    },
    dispatch_created: {
      title: '新子工单待处理',
      content: '主工单 {{orderNo}} 已分派到 {{moduleName}}。',
      defaultLink: '/dispatched-orders/{{dispatchedOrderId}}',
      defaultChannels: ['in_app'],
    },
    dispatch_resubmit: {
      title: '退回工单重新提交',
      content: '主工单 {{orderNo}} 已重新派发到 {{moduleCode}}。',
      defaultLink: '/dispatched-orders/{{dispatchedOrderId}}',
      defaultChannels: ['in_app'],
    },
    dispatched_new: {
      title: '新子工单待接单 · {{module}}',
      content: '{{employeeName}} 的 {{orderTypeName}} 工单已派给你，工单号 {{orderNo}}。',
      defaultLink: '/my-dispatched/{{dispatchedOrderId}}',
      defaultChannels: ['in_app'],
    },
    dispatched_accepted: {
      title: '子工单已接单',
      content: '工单 {{orderNo}} 的 {{moduleName}} 已由 {{handlerName}} 接单。',
      defaultLink: '/work-orders/{{workOrderId}}',
      defaultChannels: ['in_app'],
    },
    dispatched_completed: {
      title: '子工单已完成',
      content: '工单 {{orderNo}} 的 {{moduleName}} 已完成。',
      defaultLink: '/work-orders/{{workOrderId}}',
      defaultChannels: ['in_app'],
    },
    dispatched_returned: {
      title: '子工单已退回',
      content: '工单 {{orderNo}} 的 {{moduleName}} 已退回，原因：{{reason}}。',
      defaultLink: '/work-orders/{{workOrderId}}',
      defaultChannels: ['in_app'],
    },
    dispatched_returned_to_salesperson: {
      title: '工单 {{orderNo}} 被退回',
      content: '{{moduleName}} 退回原因：{{returnReason}}',
      defaultLink: '/work-orders/{{workOrderId}}',
      defaultChannels: ['in_app'],
    },
    dispatched_supplemented: {
      title: '字段已补充',
      content: '工单 {{orderNo}} 新增字段 {{fieldNames}}。',
      defaultLink: '/work-orders/{{workOrderId}}',
      defaultChannels: ['in_app'],
    },
    field_supplement: {
      title: '字段已补充',
      content: '工单 {{orderNo}} 新增字段 {{fieldNames}}。',
      defaultLink: '/work-orders/{{workOrderId}}',
      defaultChannels: ['in_app'],
    },
    field_supplemented: {
      title: '字段已补充',
      content: '工单 {{orderNo}} 新增字段 {{fieldNames}}。',
      defaultLink: '/work-orders/{{workOrderId}}',
      defaultChannels: ['in_app'],
    },
    work_order_completed: {
      title: '工单已完成',
      content: '工单 {{orderNo}} 已全部交付完成。',
      defaultLink: '/work-orders/{{workOrderId}}',
      defaultChannels: ['in_app'],
    },
    import_done: {
      title: '导入任务完成',
      content: '导入任务 {{jobId}} 已完成，成功 {{success}} 条，失败 {{fail}} 条。',
      defaultLink: '/work-orders/import',
      defaultChannels: ['in_app'],
    },
    import_failed: {
      title: '导入任务失败',
      content: '导入任务 {{jobId}} 存在失败行。',
      defaultLink: '/work-orders/import',
      defaultChannels: ['in_app'],
    },
    sla_breach: {
      title: '【SLA 超时】{{moduleName}}-{{orderNo}}',
      content: '已超 {{threshold}} 小时未处理。',
      defaultLink: '/my-dispatched/{{dispatchedOrderId}}',
      defaultChannels: ['in_app'],
    },
    reassigned_to_you: {
      title: '子工单重新分派给您：{{moduleName}}-{{orderNo}}',
      content: '{{reason}}',
      defaultLink: '/my-dispatched/{{dispatchedOrderId}}',
      defaultChannels: ['in_app'],
    },
    pool_new: {
      title: '【新公共池任务】{{moduleName}}',
      content: '工单 {{orderNo}} 待认领。',
      defaultLink: '/my-dispatched?onlyPool=true',
      defaultChannels: ['in_app'],
    },
    system_announcement: {
      title: '{{title}}',
      content: '{{content}}',
      defaultLink: null,
      defaultChannels: ['in_app'],
    },
  };

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    private readonly eventBus: NotificationEventBus,
    private readonly inAppChannel: InAppNotificationChannel,
    private readonly emailChannel: MockEmailChannel,
    private readonly smsChannel: MockSmsChannel,
  ) {}

  async bulkCreate(inputs: BulkNotificationInput[], manager?: EntityManager): Promise<Notification[]> {
    const repository = manager?.getRepository(Notification) ?? this.notificationRepository;
    const unique = new Map<string, BulkNotificationInput>();
    for (const input of inputs) {
      if (!input.userId) continue;
      unique.set(`${input.userId}:${input.bizType}:${input.title}:${input.link ?? ''}`, input);
    }
    const rows = Array.from(unique.values()).map((input) => repository.create({
      userId: input.userId,
      bizType: input.bizType,
      title: input.title,
      content: input.content,
      link: input.link ?? null,
      payload: { ...(input.payload ?? {}), channels: (input.payload?.channels as unknown[]) ?? ['in_app'] },
      isRead: false,
      readAt: null,
    }));
    if (rows.length === 0) return [];
    const saved = await repository.save(rows);
    for (const item of saved) {
      this.eventBus.publish({
        id: item.id,
        userId: item.userId,
        bizType: item.bizType,
        title: item.title,
        content: item.content,
        link: item.link,
        payload: item.payload,
        isRead: item.isRead,
        createdAt: item.createdAt.toISOString(),
        readAt: item.readAt ? item.readAt.toISOString() : null,
      });
    }
    return saved;
  }

  async send(input: SendNotificationInput): Promise<Notification[]> {
    const recipients = Array.from(new Set(input.recipients.filter((recipient) => recipient.trim().length > 0)));
    if (recipients.length === 0) {
      return [];
    }

    const template = await this.resolveTemplate(input.templateCode);
    const params = { ...input.params };
    const title = this.render(template.title, params);
    const content = this.render(template.content, params);
    const link = input.link ?? this.render(template.defaultLink ?? '', params) ?? null;
    const channels = this.resolveChannels(input.channels, template.defaultChannels);
    const context = {
      templateCode: input.templateCode,
      bizType: input.bizType ?? input.templateCode,
      recipients,
      title,
      content,
      link,
      payload: params,
      channels,
      manager: input.manager,
    };

    const created: Notification[] = [];
    for (const channel of channels) {
      const dispatcher = this.resolveChannel(channel);
      const rows = await dispatcher.dispatch(context);
      if (channel === 'in_app') {
        created.push(...rows);
      }
    }

    return created;
  }

  async list(
    userId: string,
    query: QueryNotificationsDto,
  ): Promise<NotificationListResult> {
    const page = query.current ?? query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const bizType = query.bizType ?? query.biz_type;
    const isRead = typeof query.unread === 'boolean'
      ? !query.unread
      : query.isRead;
    const rows = await this.notificationRepository.find({
      where: {
        userId,
        ...(bizType ? { bizType } : {}),
        ...(typeof isRead === 'boolean' ? { isRead } : {}),
      },
      order: { createdAt: 'DESC' },
    });

    const items = rows.map((row) => this.toListItem(row));
    const groups = query.groupBy === 'biz_type' || query.group_by === 'biz_type'
      ? this.groupByBizType(items)
      : undefined;

    const pageItems = items.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
    return {
      list: pageItems,
      items: pageItems,
      total: items.length,
      page,
      pageSize,
      ...(groups ? { groups } : {}),
    };
  }

  async get(id: string, userId: string): Promise<NotificationListItem> {
    const row = await this.loadOwnedNotification(id, userId);
    return this.toListItem(row);
  }

  async markRead(id: string, userId: string): Promise<{ success: boolean; unread_count: number }> {
    const row = await this.loadOwnedNotification(id, userId);
    if (!row.isRead) {
      row.isRead = true;
      row.readAt = new Date();
      await this.notificationRepository.save(row);
    }
    return { success: true, unread_count: await this.countUnread(userId) };
  }

  async markAllRead(userId: string): Promise<{ success: boolean; unread_count: number }> {
    const rows = await this.notificationRepository.find({ where: { userId, isRead: false } });
    for (const row of rows) {
      row.isRead = true;
      row.readAt = new Date();
      await this.notificationRepository.save(row);
    }
    return { success: true, unread_count: await this.countUnread(userId) };
  }

  async remove(id: string, userId: string): Promise<{ success: boolean }> {
    const row = await this.loadOwnedNotification(id, userId);
    await this.notificationRepository.remove(row);
    return { success: true };
  }

  async countUnread(userId: string): Promise<number> {
    return this.notificationRepository.count({ where: { userId, isRead: false } });
  }

  async countUnreadByType(userId: string): Promise<Record<string, number>> {
    const rows = await this.notificationRepository.find({
      where: { userId, isRead: false },
      select: { bizType: true },
    });

    const counts: Record<string, number> = { sla: 0, task: 0, system: 0 };
    for (const row of rows) {
      const key = this.toUnreadBucket(row.bizType);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }

  private async resolveTemplate(templateCode: string): Promise<NotificationTemplateDefinition> {
    const template = await this.findTemplateFromDatabase(templateCode);
    if (template) {
      return template;
    }
    return this.fallbackTemplates[templateCode] ?? {
      title: templateCode,
      content: templateCode,
      defaultLink: null,
      defaultChannels: ['in_app'],
    };
  }

  private async findTemplateFromDatabase(templateCode: string): Promise<NotificationTemplateDefinition | null> {
    try {
      const rows = await this.notificationRepository.manager.query(
        `SELECT biz_type, title_template, content_template, default_link, default_channels
           FROM notification_templates
          WHERE biz_type = $1 AND COALESCE(is_active, true) = true
          LIMIT 1`,
        [templateCode],
      );
      const row = rows[0] as NotificationTemplateRow | undefined;
      if (!row) {
        return null;
      }
      return {
        title: row.title_template,
        content: row.content_template,
        defaultLink: row.default_link ?? null,
        defaultChannels: this.normalizeChannels(row.default_channels),
      };
    } catch {
      return null;
    }
  }

  private resolveChannel(channel: NotificationChannelType) {
    if (channel === 'in_app') {
      return this.inAppChannel;
    }
    if (channel === 'email') {
      return this.emailChannel;
    }
    return this.smsChannel;
  }

  private resolveChannels(inputChannels: NotificationChannelType[] | undefined, fallback: NotificationChannelType[]): NotificationChannelType[] {
    const channels = inputChannels && inputChannels.length > 0 ? inputChannels : fallback;
    const unique = Array.from(new Set(channels));
    return unique.length > 0 ? unique : ['in_app'];
  }

  private normalizeChannels(value: unknown): NotificationChannelType[] {
    if (Array.isArray(value)) {
      return value.filter((item): item is NotificationChannelType => item === 'in_app' || item === 'email' || item === 'sms');
    }
    if (value && typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>)
        .filter(([, enabled]) => Boolean(enabled))
        .map(([key]) => key)
        .filter((item): item is NotificationChannelType => item === 'in_app' || item === 'email' || item === 'sms');
    }
    return ['in_app'];
  }

  private toListItem(notification: Notification): NotificationListItem {
    return {
      id: notification.id,
      bizType: notification.bizType,
      biz_type: notification.bizType,
      title: notification.title,
      content: notification.content,
      link: notification.link,
      payload: notification.payload ?? null,
      isRead: notification.isRead,
      is_read: notification.isRead,
      createdAt: notification.createdAt,
      created_at: notification.createdAt,
      readAt: notification.readAt,
      // map payload fields for frontend compatibility
      ref_order_id: (notification.payload as Record<string, unknown> | null)?.workOrderId as string | undefined,
      ref_order_no: (notification.payload as Record<string, unknown> | null)?.orderNo as string | undefined,
      order_no: (notification.payload as Record<string, unknown> | null)?.orderNo as string | undefined,
      diff_summary: (notification.payload as Record<string, unknown> | null)?.diffSummary as string | undefined,
      diff_fields: (notification.payload as Record<string, unknown> | null)?.diffFields as NotificationListItem['diff_fields'],
      priority: ((notification.payload as Record<string, unknown> | null)?.priority as string | undefined) ?? 'normal',
      type: notification.bizType,
      entity_type: (notification.payload as Record<string, unknown> | null)?.entityType as string | null ?? null,
      entity_id: (notification.payload as Record<string, unknown> | null)?.entityId as string | null ?? null,
    };
  }

  private toUnreadBucket(bizType: string): string {
    if (bizType.includes('sla')) {
      return 'sla';
    }
    if (bizType.includes('system')) {
      return 'system';
    }
    return 'task';
  }

  private groupByBizType(items: NotificationListItem[]): Array<{ bizType: string; total: number; unread: number; latestAt: Date | null; items: NotificationListItem[] }> {
    const map = new Map<string, NotificationListItem[]>();
    for (const item of items) {
      const bucket = map.get(item.bizType) ?? [];
      bucket.push(item);
      map.set(item.bizType, bucket);
    }
    return Array.from(map.entries()).map(([bizType, rows]) => ({
      bizType,
      total: rows.length,
      unread: rows.filter((row) => !row.isRead).length,
      latestAt: rows[0]?.createdAt ?? null,
      items: rows,
    }));
  }

  private async loadOwnedNotification(id: string, userId: string): Promise<Notification> {
    const row = await this.notificationRepository.findOne({ where: { id, userId } });
    if (!row) {
      throw businessException(4400, HttpStatus.NOT_FOUND, '通知不存在');
    }
    return row;
  }

  private render(template: string, params: Record<string, unknown>): string {
    return this.renderSections(template, params).replace(/\{\{\s*(\w+)\s*\}}/g, (_match, key: string) => {
      const value = params[key];
      return value === null || value === undefined ? '' : String(value);
    });
  }

  private renderSections(template: string, params: Record<string, unknown>): string {
    let rendered = template;
    rendered = rendered.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_match, key: string, content: string) => {
      return this.truthy(params[key]) ? content : '';
    });
    rendered = rendered.replace(/\{\{\^(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_match, key: string, content: string) => {
      return this.truthy(params[key]) ? '' : content;
    });
    return rendered;
  }

  private truthy(value: unknown): boolean {
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return Boolean(value);
  }
}
