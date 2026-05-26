import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import {
  DispatchedOrder,
  DispatchedOrderStatus,
  ModuleHandler,
  Notification,
} from 'src/entities';

const OPEN_SLA_STATUSES = [DispatchedOrderStatus.PENDING, DispatchedOrderStatus.PROCESSING];
const SLA_BREACH_BIZ_TYPE = 'sla_breach';
const SLA_SCAN_LIMIT = 200;

@Injectable()
export class SlaNotificationService {
  private readonly logger = new Logger(SlaNotificationService.name);
  private running = false;

  constructor(
    @InjectRepository(DispatchedOrder)
    private readonly dispatchedOrderRepository: Repository<DispatchedOrder>,
    @InjectRepository(ModuleHandler)
    private readonly moduleHandlerRepository: Repository<ModuleHandler>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
  ) {}

  @Cron('0 */5 * * * *')
  async scanAndNotifyOverdueDispatchedOrders(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const created = await this.createOverdueNotifications();
      if (created > 0) {
        this.logger.log(`Created ${created} SLA breach notifications for overdue dispatched orders`);
      }
    } catch (error) {
      this.logger.error('Failed to create SLA breach notifications', error instanceof Error ? error.stack : String(error));
    } finally {
      this.running = false;
    }
  }

  async createOverdueNotifications(now = new Date()): Promise<number> {
    const overdueOrders = await this.dispatchedOrderRepository.find({
      where: {
        status: In(OPEN_SLA_STATUSES),
        dueAt: LessThan(now),
      },
      relations: { parentOrder: true },
      order: { dueAt: 'ASC' },
      take: SLA_SCAN_LIMIT,
    });

    let created = 0;
    for (const order of overdueOrders) {
      if (!order.dueAt || !order.parentOrder) continue;
      const dueAt = order.dueAt;
      const recipients = await this.resolveRecipients(order);
      if (recipients.length === 0) continue;

      const existing = await this.notificationRepository.find({
        where: {
          bizType: SLA_BREACH_BIZ_TYPE,
          isRead: false,
        },
      });
      const existingKeys = new Set(existing
        .filter((item) => {
          const payload = item.payload ?? {};
          return payload.dispatchedOrderId === order.id || payload.entityId === order.id;
        })
        .map((item) => item.userId));

      const rows = recipients
        .filter((userId) => !existingKeys.has(userId))
        .map((userId) => this.notificationRepository.create({
          userId,
          bizType: SLA_BREACH_BIZ_TYPE,
          title: '子工单已超时',
          content: `工单 ${order.parentOrder.orderNo} 的 ${order.moduleCode} 子工单已超过处理时限，请尽快处理。`,
          link: `/my-dispatched/${order.id}`,
          payload: {
            workOrderId: order.parentOrder.id,
            orderNo: order.parentOrder.orderNo,
            dispatchedOrderId: order.id,
            entityType: 'dispatched_order',
            entityId: order.id,
            moduleCode: order.moduleCode,
            status: order.status,
            dueAt: dueAt.toISOString(),
            due_at: dueAt.toISOString(),
            priority: 'urgent',
          },
          isRead: false,
          readAt: null,
        }));

      if (rows.length > 0) {
        await this.notificationRepository.save(rows);
        created += rows.length;
      }
    }
    return created;
  }

  private async resolveRecipients(order: DispatchedOrder): Promise<string[]> {
    const handlers = await this.moduleHandlerRepository.find({
      where: { moduleCode: order.moduleCode, isActive: true },
    });
    return Array.from(new Set([
      order.handlerId,
      ...handlers.map((handler) => handler.handlerId),
    ].filter((userId): userId is string => Boolean(userId))));
  }
}
