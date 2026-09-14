import 'reflect-metadata';
import { MANAGEMENT_SCOPE_ROLES, WORK_ORDER_CREATOR_ROLES } from 'src/common/auth/role-permissions';
import { ROLES_KEY } from 'src/common/decorators/roles.decorator';
import { PortalReviewWorkbenchController } from 'src/modules/customer-portal/portal-review.controller';

describe('Portal review workbench HTTP roles', () => {
  it('allows management roles to read the cross-customer workbench', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, PortalReviewWorkbenchController) as string[];
    expect(roles).toEqual(expect.arrayContaining([...WORK_ORDER_CREATOR_ROLES, ...MANAGEMENT_SCOPE_ROLES]));
  });

  it('keeps return-for-correction write endpoint restricted to review writers', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, PortalReviewWorkbenchController.prototype.returnForCorrection) as string[];
    expect(roles).toEqual([...WORK_ORDER_CREATOR_ROLES]);
    expect(roles).not.toContain('business_owner');
  });
});

