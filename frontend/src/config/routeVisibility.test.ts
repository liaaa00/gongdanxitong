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

  it('keeps business owner only on dashboard, team work and history work routes', () => {
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
  });

  it('allows salesperson history but blocks team and backend module menus', () => {
    const memberRoles = roles([ROLE.BUSINESS_GROUP_MEMBER]);
    expect(canAccessPath('/my-work/initiated', memberRoles)).toBe(true);
    expect(canAccessPath('/my-work/returned', memberRoles)).toBe(true);
    expect(canAccessPath('/my-work/history', memberRoles)).toBe(true);
    expect(canAccessPath('/work-orders/create', memberRoles)).toBe(true);
    expect(canAccessPath('/work-orders/import', memberRoles)).toBe(true);
    expect(canAccessPath('/my-work/team', memberRoles)).toBe(false);
    expect(canAccessPath('/onboarding/contract', memberRoles)).toBe(false);
  });

  it('allows business group leader salesperson views plus team switch', () => {
    const leaderRoles = roles([ROLE.BUSINESS_GROUP_LEADER]);
    expect(canAccessPath('/my-work/initiated', leaderRoles)).toBe(true);
    expect(canAccessPath('/my-work/returned', leaderRoles)).toBe(true);
    expect(canAccessPath('/my-work/history', leaderRoles)).toBe(true);
    expect(canAccessPath('/my-work/team', leaderRoles)).toBe(true);
    expect(canAccessPath('/my-dispatched/child-1', leaderRoles)).toBe(true);
    expect(canAccessPath('/work-orders', leaderRoles)).toBe(false);
    expect(canAccessPath('/work-orders/create', leaderRoles)).toBe(false);
    expect(canAccessPath('/work-orders/import', leaderRoles)).toBe(false);
    expect(canAccessPath('/my-work/pending', leaderRoles)).toBe(false);
  });

  it('keeps shared team owner out of data entry, benefit and social insurance routes', () => {
    const sharedOwnerRoles = roles([ROLE.SHARED_TEAM_OWNER]);
    expect(canAccessPath('/onboarding/contract', sharedOwnerRoles)).toBe(true);
    expect(canAccessPath('/onboarding/onboarding_contact', sharedOwnerRoles)).toBe(true);
    expect(canAccessPath('/onboarding/renewal_contract', sharedOwnerRoles)).toBe(true);
    expect(canAccessPath('/in-service/contract-renewal', sharedOwnerRoles)).toBe(true);
    expect(canAccessPath('/onboarding/resignation_contact', sharedOwnerRoles)).toBe(true);
    expect(canAccessPath('/onboarding/resignation_cert', sharedOwnerRoles)).toBe(true);
    expect(canAccessPath('/offboarding/contact-pool', sharedOwnerRoles)).toBe(true);
    expect(canAccessPath('/offboarding/proof-pool', sharedOwnerRoles)).toBe(true);
    expect(canAccessPath('/onboarding/data_entry', sharedOwnerRoles)).toBe(false);
    expect(canAccessPath('/onboarding/data_entry_resign', sharedOwnerRoles)).toBe(false);
    expect(canAccessPath('/onboarding/benefit_apply', sharedOwnerRoles)).toBe(false);
    expect(canAccessPath('/in-service/benefit-claim', sharedOwnerRoles)).toBe(false);
    expect(canAccessPath('/onboarding/social_insurance', sharedOwnerRoles)).toBe(false);
  });

  it('keeps data entry leader on data-entry modules only', () => {
    const dataEntryRoles = roles([ROLE.DATA_ENTRY_LEADER]);
    expect(canAccessPath('/onboarding/data_entry', dataEntryRoles)).toBe(true);
    expect(canAccessPath('/onboarding/data_entry_resign', dataEntryRoles)).toBe(true);
    expect(canAccessPath('/offboarding/social-suspend-pool', dataEntryRoles)).toBe(true);
    expect(canAccessPath('/onboarding/contract', dataEntryRoles)).toBe(false);
    expect(canAccessPath('/onboarding/onboarding_contact', dataEntryRoles)).toBe(false);
    expect(canAccessPath('/onboarding/resignation_contact', dataEntryRoles)).toBe(false);
    expect(canAccessPath('/onboarding/social_insurance', dataEntryRoles)).toBe(false);
  });

  it('does not expose notification route to business owner only role', () => {
    expect(canAccessPath('/notifications', roles([ROLE.BUSINESS_OWNER]))).toBe(false);
    expect(canAccessPath('/notifications', roles([ROLE.BUSINESS_GROUP_MEMBER]))).toBe(true);
    expect(canAccessPath('/notifications', roles([ROLE.LABOR_CONTRACT_MEMBER]))).toBe(true);
  });
});
