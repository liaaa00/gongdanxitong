import { HttpStatus } from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { businessException } from 'src/common/exceptions/business-exception';
import { OrderType, WorkOrder, WorkOrderStatus } from 'src/entities';

export const DUPLICATE_ID_CARD_IN_MONTH = 'DUPLICATE_ID_CARD_IN_MONTH';
export const DUPLICATE_ID_CARD_BUSINESS_CODE = 4120;

export interface DuplicateIdCardConflict {
  conflictOrderNo?: string | null;
  existedOrderNo?: string | null;
}

export function isDuplicateIdCardIndexError(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  const driverError = error.driverError as { code?: string; constraint?: string; detail?: string } | undefined;
  const duplicateConstraints = ['uq_work_orders_idcard_month', 'uq_work_orders_idcard_guard'];
  return driverError?.code === '23505' && duplicateConstraints.some((constraint) => (
    driverError.constraint === constraint || String(driverError.detail ?? '').includes(constraint)
  ));
}

export function throwDuplicateIdCardConflict(conflict?: DuplicateIdCardConflict): never {
  throw businessException(DUPLICATE_ID_CARD_BUSINESS_CODE, HttpStatus.CONFLICT, DUPLICATE_ID_CARD_IN_MONTH, {
    code: DUPLICATE_ID_CARD_IN_MONTH,
    conflictOrderNo: conflict?.conflictOrderNo ?? conflict?.existedOrderNo ?? null,
    existedOrderNo: conflict?.existedOrderNo ?? conflict?.conflictOrderNo ?? null,
  });
}

export async function findDuplicateIdCardInMonth(
  repository: Repository<WorkOrder>,
  input: { orderType: OrderType; employeeIdCard: string; createdAt?: Date; excludeId?: string },
): Promise<WorkOrder | null> {
  // 业务要求调整为“全局查重”：同一身份证号在任意月份已有未撤回/未作废入职主工单时，禁止再次提交。
  // 保留函数名是为了兼容既有调用点和历史测试名称。
  if (![OrderType.ONBOARDING, OrderType.RESIGNATION].includes(input.orderType) || !input.employeeIdCard) {
    return null;
  }
  const qb = repository.createQueryBuilder('w');
  if (!qb || typeof qb.where !== 'function') {
    return null;
  }
  qb
    .where('w.orderType = :orderType', { orderType: input.orderType })
    .andWhere('w.employeeIdCard = :employeeIdCard', { employeeIdCard: input.employeeIdCard })
    .andWhere('w.status NOT IN (:...terminalIgnoredStatuses)', { terminalIgnoredStatuses: [WorkOrderStatus.WITHDRAWN, WorkOrderStatus.VOID] })
    .orderBy('w.createdAt', 'DESC');
  if (input.orderType === OrderType.RESIGNATION) {
    const targetDate = input.createdAt ?? new Date();
    const monthStart = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), 1));
    const nextMonthStart = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth() + 1, 1));
    qb.andWhere('w.createdAt >= :monthStart', { monthStart });
    qb.andWhere('w.createdAt < :nextMonthStart', { nextMonthStart });
  }
  if (input.excludeId) {
    qb.andWhere('w.id <> :excludeId', { excludeId: input.excludeId });
  }
  return typeof qb.getOne === 'function' ? qb.getOne() : null;
}
