import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, In, Not, Repository } from 'typeorm';
import { businessException } from 'src/common/exceptions/business-exception';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

import { Notification, User } from 'src/entities';
import { NotificationEventBus } from './notification-event-bus';
import { MockEmailChannel } from './channels/mock-email.channel';
import { MockSmsChannel } from './channels/mock-sms.channel';
import { InAppNotificationChannel } from './channels/in-app.channel';
import { NotificationChannelType } from './channels/channel-dispatcher.interface';
import {
  buildDiffSummary,
  buildReadableFieldChangeContent,
  extractInternalKeysFromPayload,
  extractInternalKeysFromText,
  localizeInternalKeysInText,
  normalizeReadableDiffFields,
  ReadableDiffField,
} from './notification-display.util';

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
  includeDispatch?: boolean | string;
  priority?: string;
  groupBy?: string;
  group_by?: string;
  bucket?: string;
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
  notificationBucket?: NotificationBucket;
  notification_bucket?: NotificationBucket;
  salespersonCategory?: SalespersonNotificationBucket | null;
  salesperson_category?: SalespersonNotificationBucket | null;
  backendCategory?: BackendNotificationBucket | null;
  backend_category?: BackendNotificationBucket | null;
  entity_type?: string | null;
  entity_id?: string | null;
  ref_order_id?: string;
  ref_order_no?: string;
  order_no?: string;
  diff_summary?: string;
  diffSummary?: string;
  diff_fields?: ReadableDiffField[];
  diffFields?: ReadableDiffField[];
  actorUserId?: string;
  actor_user_id?: string;
  actorName?: string;
  actor_name?: string;
  operatorName?: string;
  operator_name?: string;
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

type BooleanLike = boolean | string | undefined;

type SalespersonNotificationBucket = 'field_changed' | 'returned' | 'withdraw_void_result' | 'system';
type SalespersonUnreadBucket = SalespersonNotificationBucket;
// 展示/处理逻辑只保留粗分类；催办、SLA 预警/超时统一归入 todo。
type BackendNotificationBucket = 'todo' | 'creator_modified' | 'withdraw_void_request' | 'system';
// 兼容旧版前端/测试读取这些细分计数字段，但业务上不再单独递增。
type LegacyBackendUnreadBucket = 'urge' | 'sla_warning' | 'sla_breached';
type BackendUnreadBucket = BackendNotificationBucket | LegacyBackendUnreadBucket;
type NotificationBucket = SalespersonNotificationBucket | BackendNotificationBucket;

interface NotificationWhereOptions {
  isRead?: boolean;
  unread?: boolean;
  bizType?: string;
  biz_type?: string;
  includeDispatch?: BooleanLike;
  /** 按 bucket 过滤（与 toNotificationBucket 口径一致），优先级高于 bizType。 */
  bucket?: string;
}

export interface UnreadCountByBucketResult {
  total: number;
  salesperson: Record<SalespersonUnreadBucket, number>;
  backend: Record<BackendUnreadBucket, number>;
  system: number;
}

const DISPATCH_BIZ_TYPES = [
  'dispatch',
  'dispatch_created',
  'dispatched_new',
  'dispatched_accepted',
  'dispatched_completed',
] as const;

const CANCELED_URGE_FEEDBACK_BIZ_TYPES = [
  'urge_feedback',
  'backend_urge_creator',
] as const;

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
      title: '【新待认领任务】{{moduleName}}',
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
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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
    const uniqueInputs = Array.from(unique.values());
    const fieldLabels = await this.resolveFieldLabelsFromInputs(uniqueInputs.map((input) => ({ content: input.content, payload: input.payload ?? null })));
    const rows = uniqueInputs.map((input) => {
      const normalized = this.normalizeNotificationDisplay(input.content, input.payload ?? null, new Map(), fieldLabels);
      return repository.create({
        userId: input.userId,
        bizType: input.bizType,
        title: input.title,
        content: normalized.content,
        link: input.link ?? null,
        payload: { ...(normalized.payload ?? {}), channels: (normalized.payload?.channels as unknown[]) ?? ['in_app'] },
        isRead: false,
        readAt: null,
      });
    });
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
    const fieldLabels = await this.resolveFieldLabelsFromInputs([{ content, payload: params }]);
    const normalized = this.normalizeNotificationDisplay(content, params, new Map(), fieldLabels);
    const context = {
      templateCode: input.templateCode,
      bizType: input.bizType ?? input.templateCode,
      recipients,
      title,
      content: normalized.content,
      link,
      payload: normalized.payload,
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
    const rows = await this.notificationRepository.find({
      where: this.buildWhere(userId, query),
      order: { createdAt: 'DESC' },
    });

    // 按 bucket 过滤（与 countUnreadByBucket 口径一致）
    const bucket = query.bucket;
    const visibleRows = rows.filter((row) => !this.isCanceledUrgeFeedback(row.bizType));
    const filteredRows = bucket
      ? visibleRows.filter((row) => this.toNotificationBucket(row.bizType) === bucket)
      : visibleRows;

    const actorNames = await this.resolveActorDisplayNames(filteredRows);
    const fieldLabels = await this.resolveFieldLabels(filteredRows);
    const items = filteredRows.map((row) => this.toListItem(row, actorNames, fieldLabels));
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
    const actorNames = await this.resolveActorDisplayNames([row]);
    const fieldLabels = await this.resolveFieldLabels([row]);
    return this.toListItem(row, actorNames, fieldLabels);
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

  async markReadByQuery(userId: string, query: QueryNotificationsDto): Promise<{ success: boolean; affected: number; unread_count: number }> {
    const rows = await this.notificationRepository.find({
      where: this.buildWhere(userId, { ...query, isRead: false }),
    });
    // 按 bucket 过滤（与 list / countUnreadByBucket 口径一致）
    const bucket = query.bucket;
    const visibleRows = rows.filter((row) => !this.isCanceledUrgeFeedback(row.bizType));
    const filteredRows = bucket
      ? visibleRows.filter((row) => this.toNotificationBucket(row.bizType) === bucket)
      : visibleRows;
    for (const row of filteredRows) {
      row.isRead = true;
      row.readAt = new Date();
      await this.notificationRepository.save(row);
    }
    return { success: true, affected: filteredRows.length, unread_count: await this.countUnread(userId, { includeDispatch: true }) };
  }

  async remove(id: string, userId: string): Promise<{ success: boolean }> {
    const row = await this.loadOwnedNotification(id, userId);
    await this.notificationRepository.remove(row);
    return { success: true };
  }

  async countUnread(userId: string, options: NotificationWhereOptions = {}): Promise<number> {
    const filters: NotificationWhereOptions = {
      bizType: options.bizType,
      biz_type: options.biz_type,
      includeDispatch: options.includeDispatch,
      isRead: false,
    };
    return this.notificationRepository.count({
      where: this.buildWhere(userId, filters),
    });
  }

  async countUnreadByBucket(userId: string): Promise<UnreadCountByBucketResult> {
    const rows = await this.notificationRepository.find({
      where: this.buildWhere(userId, { isRead: false }),
      select: { bizType: true },
    });

    const counts = this.emptyUnreadCountByBucket();
    for (const row of rows) {
      if (this.isCanceledUrgeFeedback(row.bizType)) continue;
      this.incrementUnreadBucket(counts, this.toNotificationBucket(row.bizType));
    }
    return counts;
  }

  async countUnreadByType(userId: string): Promise<Record<string, number>> {
    const rows = await this.notificationRepository.find({
      where: this.buildWhere(userId, { isRead: false }),
      select: { bizType: true },
    });

    const counts: Record<string, number> = { sla: 0, task: 0, system: 0 };
    for (const row of rows) {
      if (this.isCanceledUrgeFeedback(row.bizType)) continue;
      const key = this.toUnreadBucket(row.bizType);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }

  private buildWhere(userId: string, options: NotificationWhereOptions = {}): FindOptionsWhere<Notification> {
    const bizType = options.bizType ?? options.biz_type;
    const isRead = typeof options.unread === 'boolean'
      ? !options.unread
      : options.isRead;
    const includeDispatch = this.toBoolean(options.includeDispatch);
    const where: FindOptionsWhere<Notification> = { userId };

    if (typeof isRead === 'boolean') {
      where.isRead = isRead;
    }

    // 当传入 bucket 时，不按 bizType 精确过滤，改为取全部后在 JS 中用 toNotificationBucket 过滤
    if (options.bucket) {
      // 不做 bizType 过滤，只做 isRead + includeDispatch
      if (!includeDispatch) {
        where.bizType = Not(In([...DISPATCH_BIZ_TYPES, ...CANCELED_URGE_FEEDBACK_BIZ_TYPES]));
      } else {
        where.bizType = Not(In([...CANCELED_URGE_FEEDBACK_BIZ_TYPES]));
      }
      return where;
    }

    if (bizType) {
      const bizTypes = bizType.split(',').map((item) => item.trim()).filter(Boolean);
      const allowedBizTypes = bizTypes.filter((item) => !this.isCanceledUrgeFeedback(item) && (includeDispatch || !this.isDispatchBizType(item)));
      where.bizType = allowedBizTypes.length === 0
        ? In([])
        : allowedBizTypes.length === 1
          ? allowedBizTypes[0]
          : In(allowedBizTypes);
      return where;
    }

    if (!includeDispatch) {
      where.bizType = Not(In([...DISPATCH_BIZ_TYPES, ...CANCELED_URGE_FEEDBACK_BIZ_TYPES]));
      return where;
    }

    where.bizType = Not(In([...CANCELED_URGE_FEEDBACK_BIZ_TYPES]));
    return where;
  }

  private toBoolean(value: BooleanLike): boolean {
    return value === true || value === 'true';
  }

  private isDispatchBizType(bizType: string): boolean {
    return (DISPATCH_BIZ_TYPES as readonly string[]).includes(bizType);
  }

  private emptyUnreadCountByBucket(): UnreadCountByBucketResult {
    return {
      total: 0,
      salesperson: { field_changed: 0, returned: 0, withdraw_void_result: 0, system: 0 },
      backend: { todo: 0, urge: 0, sla_warning: 0, sla_breached: 0, creator_modified: 0, withdraw_void_request: 0, system: 0 },
      system: 0,
    };
  }

  private incrementUnreadBucket(counts: UnreadCountByBucketResult, bucket: NotificationBucket): void {
    counts.total += 1;

    if (bucket === 'system') {
      counts.salesperson.system += 1;
      counts.backend.system += 1;
      counts.system += 1;
      return;
    }

    if (bucket === 'field_changed') {
      counts.salesperson.field_changed += 1;
      return;
    }

    if (bucket === 'returned' || bucket === 'withdraw_void_result') {
      counts.salesperson[bucket] += 1;
      return;
    }

    if (bucket === 'todo') {
      counts.backend.todo += 1;
      return;
    }
    if (bucket === 'creator_modified') {
      counts.backend.creator_modified += 1;
      return;
    }
    if (bucket === 'withdraw_void_request') {
      counts.backend.withdraw_void_request += 1;
      return;
    }

    counts.system += 1;
  }

  private isCanceledUrgeFeedback(bizType: string): boolean {
    const normalized = bizType.toLowerCase().replace(/[.:]/g, '_');
    return (CANCELED_URGE_FEEDBACK_BIZ_TYPES as readonly string[]).includes(normalized) || normalized.includes('urge_feedback');
  }

  private toNotificationBucket(bizType: string): NotificationBucket {
    const normalized = bizType.toLowerCase().replace(/[.:]/g, '_');
    if (normalized.includes('system')) {
      return 'system';
    }
    if (normalized.includes('dispatched_returned') || normalized.includes('returned') || normalized.includes('return')) {
      return 'returned';
    }
    if (normalized.includes('dispatched_accepted') || normalized.includes('dispatched_completed')) {
      return 'field_changed';
    }
    if (normalized.includes('sla_breached') || normalized.includes('sla_breach') || normalized.includes('breached') || normalized.includes('breach')) {
      return 'todo';
    }
    if (normalized.includes('sla_warning') || normalized.includes('sla_warn') || normalized.includes('warning') || normalized.includes('timeout')) {
      return 'todo';
    }
    if (normalized.includes('urge')) {
      return 'todo';
    }
    if (normalized.includes('withdraw_request') || normalized.includes('void_request')) {
      return 'withdraw_void_request';
    }
    if (normalized.includes('withdraw_void_result') || normalized.includes('withdraw_approved') || normalized.includes('withdraw_rejected') || normalized.includes('void_approved') || normalized.includes('void_rejected')) {
      return 'withdraw_void_result';
    }
    if (normalized.includes('order_field_changed') || normalized.includes('creator_modified') || normalized.includes('completed_modified') || normalized.includes('modified_by_creator')) {
      return 'creator_modified';
    }
    if (normalized.includes('order_supplement_filled') || normalized.includes('field_supplement') || normalized.includes('field_changed') || normalized.includes('field_change') || normalized.includes('supplement')) {
      return 'field_changed';
    }
    if (this.isDispatchBizType(bizType) || normalized.includes('todo') || normalized.includes('task') || normalized.includes('claim')) {
      return 'todo';
    }
    return 'system';
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

  private async resolveFieldLabels(notifications: Notification[]): Promise<Map<string, string>> {
    return this.resolveFieldLabelsFromInputs(notifications.map((notification) => ({
      content: notification.content,
      payload: notification.payload as Record<string, unknown> | null,
    })));
  }

  private async resolveFieldLabelsFromInputs(inputs: Array<{ content: string; payload: Record<string, unknown> | null }>): Promise<Map<string, string>> {
    const codes = new Set<string>();
    for (const input of inputs) {
      for (const code of extractInternalKeysFromText(input.content)) codes.add(code);
      for (const code of extractInternalKeysFromPayload(input.payload)) codes.add(code);
    }
    if (codes.size === 0) return new Map();
    try {
      const rows = await this.notificationRepository.manager.query(
        `SELECT field_code, field_name FROM field_configs WHERE field_code = ANY($1)`,
        [Array.from(codes)],
      ) as Array<{ field_code: string; field_name: string }>;
      return new Map(rows
        .filter((row) => row.field_code && row.field_name)
        .map((row) => [row.field_code, row.field_name]));
    } catch {
      return new Map();
    }
  }

  private normalizeNotificationDisplay(
    content: string,
    payload: Record<string, unknown> | null,
    actorNames = new Map<string, string>(),
    fieldLabels = new Map<string, string>(),
  ): { content: string; payload: Record<string, unknown> | null } {
    const basePayload = payload ? { ...payload } : null;
    const diffFields = normalizeReadableDiffFields(basePayload, fieldLabels);
    const diffSummary = buildDiffSummary(diffFields);
    const { actorName: resolvedActorName } = this.resolveActorName(basePayload, actorNames);
    const actorName = resolvedActorName ?? this.readActorNameFromPayload(basePayload);
    const normalizedPayload = basePayload
      ? {
        ...basePayload,
        ...(diffFields.length > 0 ? { diffFields, diff_fields: diffFields } : {}),
        ...(diffSummary ? { diffSummary, diff_summary: diffSummary } : {}),
      }
      : null;

    const localizedContent = localizeInternalKeysInText(content, fieldLabels);
    const legacyActorContent = this.normalizeLegacyActorContent(localizedContent, actorName);
    const readableContent = diffFields.length > 0
      ? buildReadableFieldChangeContent({
        actorName,
        objectName: '工单字段',
        diffFields,
      })
      : null;

    return {
      content: readableContent ?? legacyActorContent,
      payload: normalizedPayload,
    };
  }

  private async resolveActorDisplayNames(notifications: Notification[]): Promise<Map<string, string>> {
    const actorIds = Array.from(new Set(notifications
      .map((notification) => (notification.payload as Record<string, unknown> | null)?.actorUserId)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)));
    if (actorIds.length === 0) return new Map();
    try {
      const users = await this.userRepository.find({ where: { id: In(actorIds) } });
      return new Map(actorIds.map((id) => {
        const user = users.find((item) => item.id === id);
        return [id, user?.realName || user?.username || id];
      }));
    } catch {
      return new Map(actorIds.map((id) => [id, id]));
    }
  }

  private resolveActorName(payload: Record<string, unknown> | null, actorNames: Map<string, string>): { actorUserId?: string; actorName?: string } {
    const actorUserId = payload?.actorUserId;
    if (typeof actorUserId !== 'string' || actorUserId.trim().length === 0) return {};
    return { actorUserId, actorName: actorNames.get(actorUserId) ?? actorUserId };
  }

  private normalizeLegacyActorContent(content: string, actorName?: string): string {
    if (!actorName) return content;

    const markerPattern = /^(办理人|操作人|鍔炵悊浜\??|鎿嶄綔浜\??)(\s*(?:修改了|修改|淇敼浜\?|淇敼)?)/;
    if (!markerPattern.test(content)) return content;
    return content.replace(markerPattern, `${actorName}$2`);
  }

  private readActorNameFromPayload(payload: Record<string, unknown> | null): string | undefined {
    const value = payload?.actorName ?? payload?.actor_name ?? payload?.operatorName ?? payload?.operator_name;
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }

  private toListItem(notification: Notification, actorNames = new Map<string, string>(), fieldLabels = new Map<string, string>()): NotificationListItem {
    const normalizedDisplay = this.normalizeNotificationDisplay(notification.content, notification.payload as Record<string, unknown> | null, actorNames, fieldLabels);
    const payload = normalizedDisplay.payload;
    const dispatchedOrderId = payload?.dispatchedOrderId as string | undefined;
    const payloadEntityType = payload?.entityType as string | null | undefined;
    const payloadEntityId = payload?.entityId as string | null | undefined;
    const bucket = this.toNotificationBucket(notification.bizType);
    const salespersonCategory = this.toSalespersonCategory(bucket);
    const backendCategory = this.toBackendCategory(bucket);
    const actor = this.resolveActorName(payload, actorNames);
    const content = normalizedDisplay.content;
    const diffFields = normalizeReadableDiffFields(payload, fieldLabels);
    const diffSummary = readPayloadString(payload, 'diffSummary') ?? readPayloadString(payload, 'diff_summary') ?? buildDiffSummary(diffFields);
    return {
      id: notification.id,
      bizType: notification.bizType,
      biz_type: notification.bizType,
      title: notification.title,
      content,
      link: notification.link,
      payload,
      isRead: notification.isRead,
      is_read: notification.isRead,
      createdAt: notification.createdAt,
      created_at: notification.createdAt,
      readAt: notification.readAt,
      // map payload fields for frontend compatibility
      ref_order_id: payload?.workOrderId as string | undefined,
      ref_order_no: payload?.orderNo as string | undefined,
      order_no: payload?.orderNo as string | undefined,
      diff_summary: diffSummary,
      diffSummary,
      diff_fields: diffFields,
      diffFields,
      actorUserId: actor.actorUserId,
      actor_user_id: actor.actorUserId,
      actorName: actor.actorName,
      actor_name: actor.actorName,
      operatorName: actor.actorName,
      operator_name: actor.actorName,
      priority: (payload?.priority as string | undefined) ?? 'normal',
      notificationBucket: bucket,
      notification_bucket: bucket,
      salespersonCategory,
      salesperson_category: salespersonCategory,
      backendCategory,
      backend_category: backendCategory,
      type: notification.bizType,
      entity_type: payloadEntityType ?? (dispatchedOrderId ? 'dispatched_order' : null),
      entity_id: payloadEntityId ?? dispatchedOrderId ?? null,
    };
  }

  private toSalespersonCategory(bucket: NotificationBucket): SalespersonNotificationBucket | null {
    if (bucket === 'field_changed' || bucket === 'returned' || bucket === 'withdraw_void_result' || bucket === 'system') {
      return bucket;
    }
    return null;
  }

  private toBackendCategory(bucket: NotificationBucket): BackendNotificationBucket | null {
    if (bucket === 'todo' || bucket === 'creator_modified' || bucket === 'withdraw_void_request' || bucket === 'system') {
      return bucket;
    }
    return null;
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

function readPayloadString(payload: Record<string, unknown> | null, key: string): string | undefined {
  const value = payload?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
