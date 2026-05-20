import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { DispatchedOrder, WorkOrder } from 'src/entities';
import { NotificationService } from './notification.service';

export interface FieldDiffItem {
  field: string;
  before: unknown;
  after: unknown;
}

export type FieldChangeBizType = 'order.field_changed' | 'order.completed_modified' | 'order.supplement_filled';

@Injectable()
export class FieldChangeHook {
  constructor(
    @InjectRepository(WorkOrder)
    private readonly workOrderRepository: Repository<WorkOrder>,
    @InjectRepository(DispatchedOrder)
    private readonly dispatchedOrderRepository: Repository<DispatchedOrder>,
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

    const actorName = order.creator?.id === input.actorUserId ? order.creator.realName : '办理人';
    const bizType = input.bizType ?? 'order.field_changed';
    const title = bizType === 'order.completed_modified'
      ? `已办结工单 ${order.orderNo} 被修改`
      : bizType === 'order.supplement_filled'
        ? `工单 ${order.orderNo} 补充字段已同步`
        : `工单 ${order.orderNo} 被修改`;
    await this.notificationService.bulkCreate(targets.map((userId) => ({
      userId,
      bizType,
      title,
      content: `${actorName} 修改了 ${meaningful.map((item) => item.field).join('、')}`,
      link: `/work-orders/${order.id}`,
      payload: { workOrderId: order.id, orderNo: order.orderNo, actorUserId: input.actorUserId, diff: meaningful, channels: ['in_app'] },
    })), input.manager);
  }

  async onSupplementFilled(input: { orderId: string; fields: string[]; actorUserId: string; manager?: EntityManager }): Promise<void> {
    const diff = input.fields.map((field) => ({ field, before: null, after: 'filled' }));
    await this.onWorkOrderUpdated({ ...input, diff, bizType: 'order.supplement_filled' });
  }

  private async getNotificationTargets(orderId: string, createdBy: string, actorUserId: string, manager?: EntityManager): Promise<string[]> {
    const repository = manager?.getRepository(DispatchedOrder) ?? this.dispatchedOrderRepository;
    const children = await repository.find({ where: { parentOrderId: orderId } });
    return Array.from(new Set([
      ...children.map((child) => child.handlerId).filter((id): id is string => Boolean(id)),
      createdBy,
    ])).filter((id) => id !== actorUserId);
  }

  private sameValue(left: unknown, right: unknown): boolean {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  }

  private isIgnoredField(field: string): boolean {
    return ['updatedAt', 'updated_at', 'lastModifiedAt', 'last_modified_at', 'lastModifiedBy', 'last_modified_by'].includes(field);
  }
}
