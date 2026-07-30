import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { canHandleModule, getRequiredModuleHandlerRoles } from 'src/common/auth/role-permissions';
import {
  DispatchedOrder,
  DispatchedOrderStatus,
  ModuleHandler,
  Notification,
  OperationLog,
  User,
} from 'src/entities';
import { BatchReassignStrategy } from 'src/modules/dispatched-orders/dto/batch-reassign.dto';
import { ExecuteUserHandoverDto } from './handover.dto';

const OPEN_HANDOVER_STATUSES = [
  DispatchedOrderStatus.PENDING,
  DispatchedOrderStatus.PROCESSING,
  DispatchedOrderStatus.MODIFY_PENDING,
  DispatchedOrderStatus.RETURNED,
  DispatchedOrderStatus.WITHDRAW_PENDING,
  DispatchedOrderStatus.VOID_PENDING,
];

@Injectable()
export class UserHandoverService {
  constructor(private readonly dataSource: DataSource) {}

  async preview(userId: string): Promise<{
    user: { id: string; username: string; realName: string; isActive: boolean };
    modules: Array<{ moduleCode: string; isPrimary: boolean; openOrderCount: number }>;
    totalOpenOrders: number;
  }> {
    const user = await this.dataSource.getRepository(User).findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');

    const [handlers, orders] = await Promise.all([
      this.dataSource.getRepository(ModuleHandler).find({
        where: { handlerId: userId, isActive: true },
        order: { moduleCode: 'ASC' },
      }),
      this.dataSource.getRepository(DispatchedOrder).find({
        where: { handlerId: userId, status: In(OPEN_HANDOVER_STATUSES) },
      }),
    ]);
    const moduleCodes = Array.from(new Set([
      ...handlers.map((row) => row.moduleCode),
      ...orders.map((order) => order.moduleCode),
    ])).sort();

    return {
      user: { id: user.id, username: user.username, realName: user.realName, isActive: user.isActive },
      modules: moduleCodes.map((moduleCode) => ({
        moduleCode,
        isPrimary: handlers.some((row) => row.moduleCode === moduleCode && !row.isBackup),
        openOrderCount: orders.filter((order) => order.moduleCode === moduleCode).length,
      })),
      totalOpenOrders: orders.length,
    };
  }

  async execute(
    userId: string,
    payload: ExecuteUserHandoverDto,
    actorId: string,
  ): Promise<{
    success: boolean;
    disabledUserId: string;
    transferredOrders: number;
    replacedModules: string[];
    replacementUserIds: string[];
    rolesPreserved: boolean;
  }> {
    const reason = payload.reason.trim();
    if (!reason) throw new BadRequestException('请填写离职交接原因');
    if (payload.replacementUserIds.includes(userId)) {
      throw new BadRequestException('离职人员不能作为自己的接替人');
    }
    if (payload.strategy === BatchReassignStrategy.SINGLE && payload.replacementUserIds.length !== 1) {
      throw new BadRequestException('全部转交策略只能选择一名接替人');
    }

    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new NotFoundException('用户不存在');
      if (!user.isActive) throw new BadRequestException('该账号已停用，无需重复交接');

      const [currentHandlers, openOrders, replacements] = await Promise.all([
        manager.find(ModuleHandler, { where: { handlerId: userId, isActive: true } }),
        manager.find(DispatchedOrder, {
          where: { handlerId: userId, status: In(OPEN_HANDOVER_STATUSES) },
          relations: { parentOrder: true },
        }),
        manager.find(User, {
          where: { id: In(payload.replacementUserIds), isActive: true },
          relations: { userRoles: { role: true } },
        }),
      ]);
      if (replacements.length !== payload.replacementUserIds.length) {
        throw new BadRequestException('接替人中包含不存在或已停用的账号');
      }

      const moduleCodes = Array.from(new Set([
        ...currentHandlers.map((row) => row.moduleCode),
        ...openOrders.map((order) => order.moduleCode),
      ])).sort();
      const eligibleByModule = new Map<string, User[]>();
      for (const moduleCode of moduleCodes) {
        const eligible = replacements.filter((replacement) => {
          const roles = replacement.userRoles
            .filter((binding) => binding.role?.isActive)
            .map((binding) => binding.role.code);
          return canHandleModule(moduleCode, roles);
        });
        if (eligible.length === 0) {
          const required = getRequiredModuleHandlerRoles(moduleCode);
          throw new BadRequestException(`模块 ${moduleCode} 没有具备所需角色的接替人：${required.join('、')}`);
        }
        eligible.sort((left, right) =>
          payload.replacementUserIds.indexOf(left.id) - payload.replacementUserIds.indexOf(right.id));
        eligibleByModule.set(moduleCode, eligible);
      }

      for (const row of currentHandlers) row.isActive = false;
      if (currentHandlers.length > 0) await manager.save(ModuleHandler, currentHandlers);

      for (const moduleCode of moduleCodes) {
        const eligible = eligibleByModule.get(moduleCode) ?? [];
        for (let index = 0; index < eligible.length; index += 1) {
          const replacement = eligible[index];
          let row = await manager.findOne(ModuleHandler, {
            where: { moduleCode, handlerId: replacement.id },
          });
          if (!row) row = manager.create(ModuleHandler, { moduleCode, handlerId: replacement.id });
          row.isActive = true;
          row.isBackup = false;
          row.weight = eligible.length - index;
          await manager.save(ModuleHandler, row);
        }
      }

      const loadMap = new Map<string, number>();
      if (payload.strategy === BatchReassignStrategy.LOAD_BALANCE) {
        for (const moduleCode of moduleCodes) {
          for (const replacement of eligibleByModule.get(moduleCode) ?? []) {
            const key = `${moduleCode}:${replacement.id}`;
            loadMap.set(key, await manager.count(DispatchedOrder, {
              where: {
                moduleCode,
                handlerId: replacement.id,
                status: In([DispatchedOrderStatus.PENDING, DispatchedOrderStatus.PROCESSING]),
              },
            }));
          }
        }
      }

      const cursors = new Map<string, number>();
      for (const order of openOrders) {
        const eligible = eligibleByModule.get(order.moduleCode) ?? [];
        let replacement: User;
        if (payload.strategy === BatchReassignStrategy.LOAD_BALANCE) {
          replacement = [...eligible].sort((left, right) => {
            const leftKey = `${order.moduleCode}:${left.id}`;
            const rightKey = `${order.moduleCode}:${right.id}`;
            return (loadMap.get(leftKey) ?? 0) - (loadMap.get(rightKey) ?? 0)
              || left.id.localeCompare(right.id);
          })[0];
          const loadKey = `${order.moduleCode}:${replacement.id}`;
          loadMap.set(loadKey, (loadMap.get(loadKey) ?? 0) + 1);
        } else if (payload.strategy === BatchReassignStrategy.ROUND_ROBIN) {
          const cursor = cursors.get(order.moduleCode) ?? 0;
          replacement = eligible[cursor % eligible.length];
          cursors.set(order.moduleCode, cursor + 1);
        } else {
          replacement = eligible[0];
        }

        const previousHandlerId = order.handlerId;
        const previousStatus = order.status;
        order.handlerId = replacement.id;
        order.status = DispatchedOrderStatus.PENDING;
        order.acceptedAt = null;
        await manager.save(DispatchedOrder, order);
        await manager.save(OperationLog, manager.create(OperationLog, {
          entityType: 'dispatched_order',
          entityId: order.id,
          userId: actorId,
          actionType: 'reassign',
          beforeData: { previousHandlerId, status: previousStatus },
          afterData: {
            previousHandlerId,
            newHandlerId: replacement.id,
            reason,
            handoverUserId: userId,
          },
          ipAddress: null,
        }));
        await manager.save(Notification, manager.create(Notification, {
          userId: replacement.id,
          bizType: 'user_handover',
          title: '收到离职交接工单',
          content: reason,
          link: `/dispatched-orders/${order.id}`,
          payload: {
            workOrderId: order.parentOrderId,
            dispatchedOrderId: order.id,
            moduleCode: order.moduleCode,
            handoverUserId: userId,
          },
          isRead: false,
          readAt: null,
        }));
      }

      user.isActive = false;
      user.authVersion = (user.authVersion ?? 0) + 1;
      await manager.save(User, user);
      await manager.save(OperationLog, manager.create(OperationLog, {
        entityType: 'users',
        entityId: user.id,
        userId: actorId,
        actionType: 'handover',
        beforeData: { isActive: true, moduleCodes, openOrderCount: openOrders.length },
        afterData: {
          isActive: false,
          reason,
          strategy: payload.strategy,
          replacementUserIds: payload.replacementUserIds,
          rolesPreserved: true,
        },
        ipAddress: null,
      }));

      return {
        success: true,
        disabledUserId: user.id,
        transferredOrders: openOrders.length,
        replacedModules: moduleCodes,
        replacementUserIds: payload.replacementUserIds,
        rolesPreserved: true,
      };
    });
  }
}
