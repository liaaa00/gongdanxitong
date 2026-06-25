import { HttpStatus } from '@nestjs/common';
import { OrderType } from 'src/entities';
import { assertCanImportWorkOrder, FIRST_PHASE_IMPORT_ORDER_TYPES } from 'src/modules/imports/import-permissions';
import { JwtUserPayload } from 'src/modules/auth/auth.types';

function makeUser(roles: string[]): JwtUserPayload {
  return { sub: 'u-1', username: 'tester', roles };
}

describe('import work-order permission guard', () => {
  it('allows admin, business member and business group leader to import phase-1 onboarding/resignation orders', () => {
    expect(FIRST_PHASE_IMPORT_ORDER_TYPES).toEqual([OrderType.ONBOARDING, OrderType.RESIGNATION]);

    for (const roles of [['admin'], ['business_group_member'], ['biz_member'], ['salesperson'], ['business_group_leader'], ['biz_leader']]) {
      for (const orderType of FIRST_PHASE_IMPORT_ORDER_TYPES) {
        expect(() => assertCanImportWorkOrder(makeUser(roles), orderType)).not.toThrow();
      }
    }
  });

  it('blocks business owner and backend processor roles even if they hit the import API directly', () => {
    for (const roles of [['business_owner'], ['biz_manager'], ['labor_contract_member'], ['social_insurance_specialist']]) {
      expect(() => assertCanImportWorkOrder(makeUser(roles), OrderType.ONBOARDING)).toThrow(expect.objectContaining({
        status: HttpStatus.FORBIDDEN,
      }));
    }
  });

  it('blocks in-service import types in phase 1 for otherwise eligible business users', () => {
    const user = makeUser(['business_group_member']);

    for (const orderType of [OrderType.RENEWAL, OrderType.BENEFIT]) {
      expect(() => assertCanImportWorkOrder(user, orderType)).toThrow(expect.objectContaining({
        status: HttpStatus.BAD_REQUEST,
      }));
    }
  });
});
