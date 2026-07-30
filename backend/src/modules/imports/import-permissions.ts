import { HttpStatus } from '@nestjs/common';
import {
  BUSINESS_LEADER_ROLES,
  BUSINESS_MEMBER_ROLES,
  hasAnyRole,
  isAdminRole,
} from 'src/common/auth/role-permissions';
import { businessException } from 'src/common/exceptions/business-exception';
import { OrderType } from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';

export const FIRST_PHASE_IMPORT_ORDER_TYPES: readonly OrderType[] = [
  OrderType.ONBOARDING,
  OrderType.RESIGNATION,
];

export const WORK_ORDER_IMPORT_ORDER_TYPES: readonly OrderType[] = [
  ...FIRST_PHASE_IMPORT_ORDER_TYPES,
  OrderType.OUT_OF_PROVINCE_INCREASE,
  OrderType.OUT_OF_PROVINCE_DECREASE,
];

export function assertCanImportWorkOrder(user: JwtUserPayload, orderType: OrderType): void {
  if (!WORK_ORDER_IMPORT_ORDER_TYPES.includes(orderType)) {
    throw businessException(4224, HttpStatus.BAD_REQUEST, '当前仅开放入职、离职及省外增减员导入');
  }

  if (isAdminRole(user.roles) || hasAnyRole(user.roles, [...BUSINESS_MEMBER_ROLES, ...BUSINESS_LEADER_ROLES])) {
    return;
  }

  throw businessException(5000, HttpStatus.FORBIDDEN, '仅业务员或业务组长可发起导入');
}
