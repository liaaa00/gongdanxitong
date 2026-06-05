import { describe, expect, it } from 'vitest';
import { canAccessPath } from './routeVisibility';
import { ROLE } from '@/constants/roles';

const roles = (codes: string[]) => codes.map((code) => ({ code }));

describe('routeVisibility admin-only configuration routes', () => {
  it('allows admin to access field/workflow/export/portal configuration routes', () => {
    const adminRoles = roles([ROLE.ADMIN]);
    expect(canAccessPath('/admin/fields', adminRoles)).toBe(true);
    expect(canAccessPath('/admin/field-permissions', adminRoles)).toBe(true);
    expect(canAccessPath('/admin/workflows', adminRoles)).toBe(true);
    expect(canAccessPath('/admin/workflow-config', adminRoles)).toBe(true);
    expect(canAccessPath('/admin/export-templates', adminRoles)).toBe(true);
    expect(canAccessPath('/export-templates', adminRoles)).toBe(true);
    expect(canAccessPath('/admin/system-settings', adminRoles)).toBe(true);
    expect(canAccessPath('/admin/logs', adminRoles)).toBe(true);
    expect(canAccessPath('/admin/ai-settings', adminRoles)).toBe(true);
    expect(canAccessPath('/admin/login-debug', adminRoles)).toBe(true);
  });

  it('blocks non-admin direct URL access to restricted configuration routes', () => {
    const businessRoles = roles([ROLE.BUSINESS_GROUP_MEMBER]);
    expect(canAccessPath('/admin/fields', businessRoles)).toBe(false);
    expect(canAccessPath('/admin/field-permissions', businessRoles)).toBe(false);
    expect(canAccessPath('/admin/workflows', businessRoles)).toBe(false);
    expect(canAccessPath('/admin/workflow-config', businessRoles)).toBe(false);
    expect(canAccessPath('/admin/export-templates', businessRoles)).toBe(false);
    expect(canAccessPath('/export-templates', businessRoles)).toBe(false);
    expect(canAccessPath('/admin/system-settings', businessRoles)).toBe(false);
    expect(canAccessPath('/admin/logs', businessRoles)).toBe(false);
    expect(canAccessPath('/admin/ai-settings', businessRoles)).toBe(false);
    expect(canAccessPath('/admin/login-debug', businessRoles)).toBe(false);
    expect(canAccessPath('/my-field-permissions', businessRoles)).toBe(false);
  });

  it('keeps business owner on dashboard, team work and history only', () => {
    const ownerRoles = roles([ROLE.BUSINESS_OWNER]);
    expect(canAccessPath('/dashboard', ownerRoles)).toBe(true);
    expect(canAccessPath('/my-work/team', ownerRoles)).toBe(true);
    expect(canAccessPath('/my-work/history', ownerRoles)).toBe(true);
    expect(canAccessPath('/my-dispatched/child-1', ownerRoles)).toBe(true);
    expect(canAccessPath('/work-orders', ownerRoles)).toBe(false);
    expect(canAccessPath('/work-orders/create', ownerRoles)).toBe(false);
    expect(canAccessPath('/work-orders/import', ownerRoles)).toBe(false);
    expect(canAccessPath('/work-orders/wo-1', ownerRoles)).toBe(false);
    expect(canAccessPath('/my-work/initiated', ownerRoles)).toBe(false);
    expect(canAccessPath('/my-work/returned', ownerRoles)).toBe(false);
    expect(canAccessPath('/onboarding/contract', ownerRoles)).toBe(false);
    expect(canAccessPath('/onboarding/onboarding_contact', ownerRoles)).toBe(false);
    expect(canAccessPath('/onboarding/social_insurance', ownerRoles)).toBe(false);
    expect(canAccessPath('/onboarding/resignation_contact', ownerRoles)).toBe(false);
    expect(canAccessPath('/offboarding/contact-pool', ownerRoles)).toBe(false);
    expect(canAccessPath('/my-work/pending', ownerRoles)).toBe(false);
    expect(canAccessPath('/my-work/done', ownerRoles)).toBe(false);
  });

  it('allows salesperson onboarding/offboarding main and sub-work-order routes without team/backend menus', () => {
    const memberRoles = roles([ROLE.BUSINESS_GROUP_MEMBER]);
    expect(canAccessPath('/work-orders', memberRoles)).toBe(true);
    expect(canAccessPath('/work-orders/create', memberRoles)).toBe(true);
    expect(canAccessPath('/work-orders/import', memberRoles)).toBe(true);
    expect(canAccessPath('/onboarding/onboarding_contact', memberRoles)).toBe(true);
    expect(canAccessPath('/onboarding/contract', memberRoles)).toBe(true);
    expect(canAccessPath('/onboarding/data_entry', memberRoles)).toBe(true);
    expect(canAccessPath('/onboarding/social_insurance', memberRoles)).toBe(true);
    expect(canAccessPath('/onboarding/resignation_contact', memberRoles)).toBe(true);
    expect(canAccessPath('/onboarding/data_entry_resign', memberRoles)).toBe(true);
    expect(canAccessPath('/onboarding/social_insurance_resign', memberRoles)).toBe(true);
    expect(canAccessPath('/onboarding/resignation_cert', memberRoles)).toBe(false);
    expect(canAccessPath('/onboarding/renewal_contract', memberRoles)).toBe(false);
    expect(canAccessPath('/onboarding/benefit_apply', memberRoles)).toBe(false);
    expect(canAccessPath('/my-work/initiated', memberRoles)).toBe(true);
    expect(canAccessPath('/my-work/returned', memberRoles)).toBe(true);
    expect(canAccessPath('/my-work/history', memberRoles)).toBe(true);
    expect(canAccessPath('/my-work/team', memberRoles)).toBe(false);
    expect(canAccessPath('/my-work/pending', memberRoles)).toBe(false);
    expect(canAccessPath('/my-work/done', memberRoles)).toBe(true);
  });

  it('keeps business group leader operable on business modules and own work views', () => {
    const leaderRoles = roles([ROLE.BUSINESS_GROUP_LEADER]);
    expect(canAccessPath('/work-orders', leaderRoles)).toBe(true);
    expect(canAccessPath('/work-orders/create', leaderRoles)).toBe(true);
    expect(canAccessPath('/work-orders/import', leaderRoles)).toBe(true);
    expect(canAccessPath('/my-work/initiated', leaderRoles)).toBe(true);
    expect(canAccessPath('/my-work/returned', leaderRoles)).toBe(true);
    expect(canAccessPath('/my-work/history', leaderRoles)).toBe(true);
    expect(canAccessPath('/my-work/team', leaderRoles)).toBe(true);
    expect(canAccessPath('/my-dispatched/child-1', leaderRoles)).toBe(true);
    expect(canAccessPath('/my-work/pending', leaderRoles)).toBe(false);
    expect(canAccessPath('/my-work/done', leaderRoles)).toBe(true);
    expect(canAccessPath('/onboarding/onboarding_contact', leaderRoles)).toBe(true);
    expect(canAccessPath('/onboarding/contract', leaderRoles)).toBe(true);
    expect(canAccessPath('/onboarding/data_entry', leaderRoles)).toBe(true);
    expect(canAccessPath('/onboarding/social_insurance', leaderRoles)).toBe(true);
    expect(canAccessPath('/onboarding/resignation_contact', leaderRoles)).toBe(true);
    expect(canAccessPath('/onboarding/data_entry_resign', leaderRoles)).toBe(true);
    expect(canAccessPath('/onboarding/social_insurance_resign', leaderRoles)).toBe(true);
  });

  it('hides all in-service routes in phase 1, including admin and backend accounts', () => {
    const adminRoles = roles([ROLE.ADMIN]);
    const contractRoles = roles([ROLE.LABOR_CONTRACT_MEMBER]);
    expect(canAccessPath('/renewal', adminRoles)).toBe(false);
    expect(canAccessPath('/renewal/new', adminRoles)).toBe(false);
    expect(canAccessPath('/benefit', adminRoles)).toBe(false);
    expect(canAccessPath('/benefit/new', adminRoles)).toBe(false);
    expect(canAccessPath('/onboarding/renewal_contract', adminRoles)).toBe(false);
    expect(canAccessPath('/onboarding/benefit_apply', adminRoles)).toBe(false);
    expect(canAccessPath('/in-service/contract-renewal', contractRoles)).toBe(false);
    expect(canAccessPath('/in-service/benefit-claim', contractRoles)).toBe(false);
  });

  it('keeps shared team owner on Yang Chun plus Mao Yani visible phase-1 modules only', () => {
    const sharedOwnerRoles = roles([ROLE.SHARED_TEAM_OWNER]);
    expect(canAccessPath('/onboarding/contract', sharedOwnerRoles)).toBe(true);
    expect(canAccessPath('/onboarding/onboarding_contact', sharedOwnerRoles)).toBe(true);
    expect(canAccessPath('/onboarding/resignation_contact', sharedOwnerRoles)).toBe(true);
    expect(canAccessPath('/onboarding/resignation_cert', sharedOwnerRoles)).toBe(false);
    expect(canAccessPath('/offboarding/contact-pool', sharedOwnerRoles)).toBe(true);
    expect(canAccessPath('/offboarding/proof-pool', sharedOwnerRoles)).toBe(false);
    expect(canAccessPath('/onboarding/data_entry', sharedOwnerRoles)).toBe(false);
    expect(canAccessPath('/onboarding/data_entry_resign', sharedOwnerRoles)).toBe(false);
    expect(canAccessPath('/onboarding/social_insurance', sharedOwnerRoles)).toBe(false);
    expect(canAccessPath('/onboarding/social_insurance_resign', sharedOwnerRoles)).toBe(false);
    expect(canAccessPath('/onboarding/renewal_contract', sharedOwnerRoles)).toBe(false);
    expect(canAccessPath('/onboarding/benefit_apply', sharedOwnerRoles)).toBe(false);
  });

  it('keeps data entry and social insurance backend roles on their own phase-1 modules only', () => {
    const dataEntryRoles = roles([ROLE.DATA_ENTRY_LEADER]);
    const socialRoles = roles([ROLE.SOCIAL_INSURANCE_SPECIALIST]);

    expect(canAccessPath('/onboarding/data_entry', dataEntryRoles)).toBe(true);
    expect(canAccessPath('/onboarding/data_entry_resign', dataEntryRoles)).toBe(true);
    expect(canAccessPath('/offboarding/social-suspend-pool', dataEntryRoles)).toBe(true);
    expect(canAccessPath('/onboarding/social_insurance', dataEntryRoles)).toBe(false);
    expect(canAccessPath('/onboarding/contract', dataEntryRoles)).toBe(false);

    expect(canAccessPath('/onboarding/social_insurance', socialRoles)).toBe(true);
    expect(canAccessPath('/onboarding/social_insurance_resign', socialRoles)).toBe(true);
    expect(canAccessPath('/offboarding/social-insurance-resign-pool', socialRoles)).toBe(true);
    expect(canAccessPath('/onboarding/onboarding_contact', socialRoles)).toBe(false);
    expect(canAccessPath('/onboarding/contract', socialRoles)).toBe(false);
    expect(canAccessPath('/onboarding/data_entry', socialRoles)).toBe(false);
  });

  it('does not let broad dynamic permissions reopen owner or hidden in-service/shared-owner routes', () => {
    const ownerRoles = roles([ROLE.BUSINESS_OWNER]);
    const leaderRoles = roles([ROLE.BUSINESS_GROUP_LEADER]);
    const sharedOwnerRoles = roles([ROLE.SHARED_TEAM_OWNER]);
    const broadPermissions = ['*', 'work_order.*', 'data_scope.all'];

    expect(canAccessPath('/my-work/team', ownerRoles, broadPermissions)).toBe(true);
    expect(canAccessPath('/my-work/history', ownerRoles, broadPermissions)).toBe(true);
    expect(canAccessPath('/work-orders', ownerRoles, broadPermissions)).toBe(false);
    expect(canAccessPath('/my-work/initiated', ownerRoles, broadPermissions)).toBe(false);
    expect(canAccessPath('/my-work/pending', ownerRoles, broadPermissions)).toBe(false);
    expect(canAccessPath('/onboarding/contract', ownerRoles, broadPermissions)).toBe(false);
    expect(canAccessPath('/offboarding/contact-pool', ownerRoles, broadPermissions)).toBe(false);

    expect(canAccessPath('/my-work/team', leaderRoles, broadPermissions)).toBe(true);
    expect(canAccessPath('/work-orders', leaderRoles, broadPermissions)).toBe(true);
    expect(canAccessPath('/work-orders/import', leaderRoles, broadPermissions)).toBe(true);
    expect(canAccessPath('/my-work/initiated', leaderRoles, broadPermissions)).toBe(true);
    expect(canAccessPath('/my-work/returned', leaderRoles, broadPermissions)).toBe(true);
    expect(canAccessPath('/my-work/pending', leaderRoles, broadPermissions)).toBe(false);
    expect(canAccessPath('/my-work/done', leaderRoles, broadPermissions)).toBe(true);
    expect(canAccessPath('/onboarding/contract', leaderRoles, broadPermissions)).toBe(true);
    expect(canAccessPath('/onboarding/data_entry', leaderRoles, broadPermissions)).toBe(true);
    expect(canAccessPath('/onboarding/resignation_contact', leaderRoles, broadPermissions)).toBe(true);
    expect(canAccessPath('/onboarding/social_insurance_resign', leaderRoles, broadPermissions)).toBe(true);

    expect(canAccessPath('/onboarding/contract', sharedOwnerRoles, broadPermissions)).toBe(true);
    expect(canAccessPath('/onboarding/onboarding_contact', sharedOwnerRoles, broadPermissions)).toBe(true);
    expect(canAccessPath('/onboarding/data_entry', sharedOwnerRoles, broadPermissions)).toBe(false);
    expect(canAccessPath('/onboarding/data_entry_resign', sharedOwnerRoles, broadPermissions)).toBe(false);
    expect(canAccessPath('/in-service/benefit-claim', sharedOwnerRoles, broadPermissions)).toBe(false);
    expect(canAccessPath('/onboarding/social_insurance', sharedOwnerRoles, broadPermissions)).toBe(false);
    expect(canAccessPath('/offboarding/social-suspend-pool', sharedOwnerRoles, broadPermissions)).toBe(false);
  });

  it('does not expose notification route to business owner only role', () => {
    expect(canAccessPath('/notifications', roles([ROLE.BUSINESS_OWNER]))).toBe(false);
    expect(canAccessPath('/notifications', roles([ROLE.BUSINESS_GROUP_MEMBER]))).toBe(true);
    expect(canAccessPath('/notifications', roles([ROLE.LABOR_CONTRACT_MEMBER]))).toBe(true);
  });
});
