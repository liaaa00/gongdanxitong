import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { DispatchedOrder, WorkOrder, User } from 'src/entities';
import { NotificationService } from './notification.service';
import {
  buildDiffSummary,
  buildReadableFieldChangeContent,
  normalizeReadableDiffFields,
} from './notification-display.util';

export interface FieldDiffItem {
  field: string;
  before: unknown;
  after: unknown;
}

export type FieldChangeBizType = 'order.field_changed' | 'order.completed_modified' | 'order.supplement_filled' | 'dispatch_resubmit';

@Injectable()
export class FieldChangeHook {
  constructor(
    @InjectRepository(WorkOrder)
    private readonly workOrderRepository: Repository<WorkOrder>,
    @InjectRepository(DispatchedOrder)
    private readonly dispatchedOrderRepository: Repository<DispatchedOrder>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly notificationService: NotificationService,
  ) {}

  buildDiff(before: Record<string, unknown> | null | undefined, after: Record<string, unknown> | null | undefined): FieldDiffItem[] {
    const left = before ?? {};
    const right = after ?? {};
    const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)]));
    return keys
      .filter((key) => !this.isIgnoredField(key))
      .filter((key) => !this.sameValue(left[key], right[key]))
      .map((key) => ({ field: key, before: left[key] ?? null, after: right[key] ?? null }));
  }

  async onWorkOrderUpdated(input: {
    orderId: string;
    diff: FieldDiffItem[];
    actorUserId: string;
    bizType?: FieldChangeBizType;
    manager?: EntityManager;
  }): Promise<void> {
    const meaningful = input.diff.filter((item) => !this.isIgnoredField(item.field));
    if (meaningful.length === 0) return;
    const repository = input.manager?.getRepository(WorkOrder) ?? this.workOrderRepository;
    const order = await repository.findOne({ where: { id: input.orderId }, relations: { creator: true } });
    if (!order) return;

    const targets = await this.getNotificationTargets(input.orderId, order.createdBy, input.actorUserId, input.manager);
    if (targets.length === 0) return;

    // 查询实际操作人姓名；查不到用户时也保留 userId，避免通知显示“操作人/办理人”这类泛称。
    let actorName = input.actorUserId || '系统';
    const userRepo = input.manager?.getRepository(User) ?? this.userRepository;
    const actor = await userRepo.findOne({ where: { id: input.actorUserId } });
    if (actor) {
      actorName = actor.realName || actor.username || input.actorUserId;
    }

    const bizType = input.bizType ?? 'order.field_changed';
    const title = bizType === 'order.completed_modified'
      ? `已办结工单 ${order.orderNo} 被修改`
      : bizType === 'order.supplement_filled'
        ? `工单 ${order.orderNo} 补充字段已同步`
        : `工单 ${order.orderNo} 被修改`;
    const diffFields = normalizeReadableDiffFields({ diff: meaningful });
    const diffSummary = buildDiffSummary(diffFields);
    const content = buildReadableFieldChangeContent({
      actorName,
      objectName: '工单字段',
      diffFields,
      action: bizType === 'order.supplement_filled' ? '补充了' : '修改了',
    }) ?? `${actorName} 修改了【工单字段】`;
    await this.notificationService.bulkCreate(targets.map((userId) => ({
      userId,
      bizType,
      title,
      content,
      link: `/work-orders/${order.id}`,
      payload: {
        workOrderId: order.id,
        orderNo: order.orderNo,
        actorUserId: input.actorUserId,
        actorName,
        diff: meaningful,
        diffFields,
        diffSummary,
        channels: ['in_app'],
      },
    })), input.manager);
  }

  async onSupplementFilled(input: { orderId: string; fields: string[]; actorUserId: string; manager?: EntityManager }): Promise<void> {
    const diff = input.fields.map((field) => ({ field, before: null, after: 'filled' }));
    await this.onWorkOrderUpdated({ ...input, diff, bizType: 'order.supplement_filled' });
  }

  private async getNotificationTargets(orderId: string, createdBy: string, actorUserId: string, manager?: EntityManager): Promise<string[]> {
    const repository = manager?.getRepository(DispatchedOrder) ?? this.dispatchedOrderRepository;
    const children = await repository.find({ where: { parentOrderId: orderId } });
    const handlerTargets = children
      .map((child) => child.handlerId)
      .filter((id): id is string => Boolean(id))
      .filter((id) => id !== actorUserId);

    // 发起人也需要保留一条“字段已同步修改”的站内通知作为操作留痕；
    // 若发起人本人修改，则不能因为 actorUserId 相同而过滤掉。
    return Array.from(new Set([...handlerTargets, createdBy]));
  }

  private sameValue(left: unknown, right: unknown): boolean {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  }

  private isIgnoredField(field: string): boolean {
    return ['updatedAt', 'updated_at', 'lastModifiedAt', 'last_modified_at', 'lastModifiedBy', 'last_modified_by'].includes(field);
  }
}
