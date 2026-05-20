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
  return driverError?.code === '23505' && (driverError.constraint === 'uq_work_orders_idcard_month' || String(driverError.detail ?? '').includes('uq_work_orders_idcard_month'));
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
  if (input.orderType !== OrderType.ONBOARDING || !input.employeeIdCard) {
    return null;
  }
  const base = input.createdAt ?? new Date();
  const monthStart = new Date(base.getFullYear(), base.getMonth(), 1);
  const monthEnd = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  const qb = repository.createQueryBuilder('w');
  if (!qb || typeof qb.where !== 'function') {
    return null;
  }
  qb
    .where('w.orderType = :orderType', { orderType: OrderType.ONBOARDING })
    .andWhere('w.employeeIdCard = :employeeIdCard', { employeeIdCard: input.employeeIdCard })
    .andWhere('w.status NOT IN (:...terminalIgnoredStatuses)', { terminalIgnoredStatuses: [WorkOrderStatus.WITHDRAWN, WorkOrderStatus.VOID] })
    .andWhere('w.createdAt >= :monthStart', { monthStart })
    .andWhere('w.createdAt < :monthEnd', { monthEnd })
    .orderBy('w.createdAt', 'DESC');
  if (input.excludeId) {
    qb.andWhere('w.id <> :excludeId', { excludeId: input.excludeId });
  }
  return typeof qb.getOne === 'function' ? qb.getOne() : null;
}
