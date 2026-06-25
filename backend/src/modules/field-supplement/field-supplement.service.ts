import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  FieldPermissionMode,
  FieldSupplementLog,
  FieldSupplementRule,
  Notification,
  DispatchedOrder,
  WorkOrder,
} from 'src/entities';
import { businessException } from 'src/common/exceptions/business-exception';
import { FieldPermissionService } from 'src/modules/field-permissions/field-permission.service';
import { FieldChangeHook } from 'src/modules/notifications/field-change.hook';
import {
  buildDiffSummary,
  buildReadableFieldChangeContent,
  normalizeReadableDiffFields,
} from 'src/modules/notifications/notification-display.util';

@Injectable()
export class FieldSupplementService {
  constructor(
    @InjectRepository(FieldSupplementRule)
    private readonly fieldSupplementRuleRepository: Repository<FieldSupplementRule>,
    @InjectRepository(FieldSupplementLog)
    private readonly fieldSupplementLogRepository: Repository<FieldSupplementLog>,
    @InjectRepository(WorkOrder)
    private readonly workOrderRepository: Repository<WorkOrder>,
    @InjectRepository(DispatchedOrder)
    private readonly dispatchedOrderRepository: Repository<DispatchedOrder>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    private readonly fieldPermissionService: FieldPermissionService,
    private readonly fieldChangeHook?: FieldChangeHook,
  ) {}

  async supplement(input: {
    dispatchedOrderId: string;
    fieldCode: string;
    newValue: unknown;
    userId: string;
    workOrderUpdatedAt?: string;
  }): Promise<{ success: boolean; workOrderId: string; fieldCode: string }> {
    const dispatchedOrder = await this.dispatchedOrderRepository.findOne({
      where: { id: input.dispatchedOrderId },
      relations: { parentOrder: true },
    });

    if (!dispatchedOrder) {
      throw businessException(4200, 404, '子工单不存在');
    }

    const workOrder = dispatchedOrder.parentOrder;
    if (workOrder.status === 'withdrawn' || workOrder.status === 'completed') {
      throw businessException(4201, 409, '工单状态不允许该操作');
    }

    if (
      input.workOrderUpdatedAt &&
      workOrder.updatedAt.toISOString() !== new Date(input.workOrderUpdatedAt).toISOString()
    ) {
      throw businessException(4201, 409, '工单已被更新，请刷新后重试', {
        workOrderUpdatedAt: workOrder.updatedAt.toISOString(),
      });
    }

    const rule = await this.fieldSupplementRuleRepository.findOne({
      where: {
        fieldCode: input.fieldCode,
        supplementerModule: dispatchedOrder.moduleCode,
        isActive: true,
      },
    });
    if (!rule) {
      throw businessException(5001, 403, '字段无可补充权限', {
        fieldCode: input.fieldCode,
        moduleCode: dispatchedOrder.moduleCode,
      });
    }

    const permissions = await this.fieldPermissionService.getPermissionsForUser(
      input.userId,
      `dispatched:${dispatchedOrder.moduleCode}`,
    );
    const permission = permissions.get(input.fieldCode) ?? FieldPermissionMode.HIDDEN;
    if (permission === FieldPermissionMode.HIDDEN) {
      throw businessException(5001, 403, '字段无可补充权限', {
        fieldCode: input.fieldCode,
        moduleCode: dispatchedOrder.moduleCode,
      });
    }

    const oldValue = workOrder.extraData[input.fieldCode] ?? null;
    const newValueText = this.toText(input.newValue);
    const oldValueText = this.toText(oldValue);

    await this.fieldSupplementLogRepository.save(
      this.fieldSupplementLogRepository.create({
        workOrderId: workOrder.id,
        dispatchedOrderId: dispatchedOrder.id,
        fieldCode: input.fieldCode,
        oldValue: oldValueText,
        newValue: newValueText,
        supplementedById: input.userId,
        supplementedAt: new Date(),
      }),
    );

    workOrder.extraData = {
      ...workOrder.extraData,
      [input.fieldCode]: input.newValue,
    };
    await this.workOrderRepository.save(workOrder);

    if (Array.isArray(rule.syncToModules) && rule.syncToModules.length > 0) {
      const children = await this.dispatchedOrderRepository.find({
        where: { parentOrderId: workOrder.id },
      });
      for (const child of children) {
        if (!rule.syncToModules.includes(child.moduleCode)) {
          continue;
        }
        const nextVisibleFields = new Set(child.visibleFields ?? []);
        nextVisibleFields.add(input.fieldCode);
        child.visibleFields = Array.from(nextVisibleFields);
        await this.dispatchedOrderRepository.save(child);
      }
    }

    const diffFields = normalizeReadableDiffFields({
      diff: [{ field: input.fieldCode, before: oldValue, after: input.newValue }],
    });
    const diffSummary = buildDiffSummary(diffFields);
    const content = buildReadableFieldChangeContent({
      actorName: '操作人',
      objectName: '工单字段',
      diffFields,
      action: '补充了',
    }) ?? `工单 ${workOrder.orderNo} 的字段已补充`;

    await this.notificationRepository.save(
      this.notificationRepository.create({
        userId: workOrder.createdBy,
        bizType: 'field_supplement',
        title: '工单字段已补充',
        content,
        link: `/work-orders/${workOrder.id}`,
        payload: {
          workOrderId: workOrder.id,
          orderNo: workOrder.orderNo,
          dispatchedOrderId: dispatchedOrder.id,
          fieldCode: input.fieldCode,
          fieldName: diffFields[0]?.field_name,
          oldValue,
          newValue: input.newValue,
          diff: [{ field: input.fieldCode, before: oldValue, after: input.newValue }],
          diffFields,
          diffSummary,
        },
        isRead: false,
        readAt: null,
      }),
    );
    if (this.fieldChangeHook) {
      await this.fieldChangeHook.onSupplementFilled({
        orderId: workOrder.id,
        fields: [input.fieldCode],
        actorUserId: input.userId,
      });
    }

    return {
      success: true,
      workOrderId: workOrder.id,
      fieldCode: input.fieldCode,
    };
  }

  async getLogs(dispatchedOrderId: string): Promise<Array<{ fieldCode: string; oldValue: string | null; newValue: string | null; supplementedById: string; supplementedAt: Date }>> {
    const rows = await this.fieldSupplementLogRepository.find({
      where: { dispatchedOrderId },
      order: { supplementedAt: 'DESC' },
    });
    return rows.map((row) => ({
      fieldCode: row.fieldCode,
      oldValue: row.oldValue,
      newValue: row.newValue,
      supplementedById: row.supplementedById,
      supplementedAt: row.supplementedAt,
    }));
  }

  private toText(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'string') {
      return value;
    }
    return JSON.stringify(value);
  }
}
