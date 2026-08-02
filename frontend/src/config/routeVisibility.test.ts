import { afterEach, describe, expect, it } from 'vitest';
import { canAccessPath, setDynamicPermissionConfig } from './routeVisibility';
import { ROLE } from '@/constants/roles';
import { DEFAULT_MATRIX } from '@/services/roleActionPermissions';

const roles = (codes: string[]) => codes.map((code) => ({ code }));

afterEach(() => setDynamicPermissionConfig(null));

describe('routeVisibility admin-only configuration routes', () => {
  it('uses the loaded permission-center route matrix before static fallback', () => {
    setDynamicPermissionConfig({
      version: '2.0.0',
      roles: [],
      routePermissions: [
        { path: '/work-orders', allowedRoles: ['admin'] },
        { path: '/dynamic-reports', allowedRoles: ['biz_member'] },
      ],
      fieldPermissions: [],
    });

    expect(canAccessPath('/work-orders', roles(['business_group_member']))).toBe(false);
    expect(canAccessPath('/work-orders', roles(['admin']))).toBe(true);
    expect(canAccessPath('/dynamic-reports', roles(['business_group_member']))).toBe(true);
    expect(canAccessPath('/dynamic-reports', roles(['admin']))).toBe(false);
  });

  it('falls back to the static matrix after dynamic configuration is cleared', () => {
    setDynamicPermissionConfig({ version: '2.0.0', roles: [], routePermissions: [{ path: '/work-orders', allowedRoles: ['admin'] }], fieldPermissions: [] });
    expect(canAccessPath('/work-orders', roles(['business_group_member']))).toBe(false);
    setDynamicPermissionConfig(null);
    expect(canAccessPath('/work-orders', roles(['business_group_member']))).toBe(true);
  });

  it('allows admin to access field/workflow/export/portal configuration routes', () => {
    const adminRoles = roles([ROLE.ADMIN]);
    expect(canAccessPath('/admin/fields', adminRoles)).toBe(true);
    expect(canAccessPath('/admin/import-templates', adminRoles)).toBe(true);
    expect(canAccessPath('/admin/field-permissions', adminRoles)).toBe(true);
    expect(canAccessPath('/admin/permission-center', adminRoles)).toBe(true);
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
    expect(canAccessPath('/admin/import-templates', businessRoles)).toBe(false);
    expect(canAccessPath('/admin/field-permissions', businessRoles)).toBe(false);
    expect(canAccessPath('/admin/permission-center', businessRoles)).toBe(false);
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

  it('keeps business owner away from my-work pages', () => {
    const ownerRoles = roles([ROLE.BUSINESS_OWNER]);
    expect(canAccessPath('/dashboard', ownerRoles)).toBe(true);
    expect(canAccessPath('/my-work/team', ownerRoles)).toBe(false);
    expect(canAccessPath('/my-work/history', ownerRoles)).toBe(false);
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
    expect(canAccessPath('/work-orders/new', memberRoles)).toBe(true);
    expect(canAccessPath('/resignation/new', memberRoles)).toBe(true);
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
    expect(canAccessPath('/my-work/initiated', memberRoles)).toBe(false);
    expect(canAccessPath('/my-work/returned', memberRoles)).toBe(false);
    expect(canAccessPath('/my-work/history', memberRoles)).toBe(false);
    expect(canAccessPath('/my-work/team', memberRoles)).toBe(false);
    expect(canAccessPath('/my-work/pending', memberRoles)).toBe(false);
    expect(canAccessPath('/my-work/done', memberRoles)).toBe(false);
  });

  it('keeps business group leader operable on business modules without my-work pages', () => {
    const leaderRoles = roles([ROLE.BUSINESS_GROUP_LEADER]);
    expect(canAccessPath('/work-orders', leaderRoles)).toBe(true);
    expect(canAccessPath('/work-orders/create', leaderRoles)).toBe(true);
    expect(canAccessPath('/work-orders/new', leaderRoles)).toBe(true);
    expect(canAccessPath('/resignation/new', leaderRoles)).toBe(true);
    expect(canAccessPath('/work-orders/import', leaderRoles)).toBe(true);
    expect(canAccessPath('/my-work/initiated', leaderRoles)).toBe(false);
    expect(canAccessPath('/my-work/returned', leaderRoles)).toBe(false);
    expect(canAccessPath('/my-work/history', leaderRoles)).toBe(false);
    expect(canAccessPath('/my-work/team', leaderRoles)).toBe(false);
    expect(canAccessPath('/my-dispatched/child-1', leaderRoles)).toBe(true);
    expect(canAccessPath('/my-work/pending', leaderRoles)).toBe(false);
    expect(canAccessPath('/my-work/done', leaderRoles)).toBe(false);
    expect(canAccessPath('/onboarding/onboarding_contact', leaderRoles)).toBe(true);
    expect(canAccessPath('/onboarding/contract', leaderRoles)).toBe(true);
    expect(canAccessPath('/onboarding/data_entry', leaderRoles)).toBe(true);
    expect(canAccessPath('/onboarding/social_insurance', leaderRoles)).toBe(true);
    expect(canAccessPath('/onboarding/resignation_contact', leaderRoles)).toBe(true);
    expect(canAccessPath('/onboarding/data_entry_resign', leaderRoles)).toBe(true);
    expect(canAccessPath('/onboarding/social_insurance_resign', leaderRoles)).toBe(true);
  });

  it('opens out-of-province list/import/TODO form only to configured business roles', () => {
    const adminRoles = roles([ROLE.ADMIN]);
    const leaderRoles = roles([ROLE.BUSINESS_GROUP_LEADER]);
    const memberRoles = roles([ROLE.BUSINESS_GROUP_MEMBER]);
    const backendRoles = roles([ROLE.SOCIAL_INSURANCE_SPECIALIST]);

    for (const path of ['/out-of-province', '/out-of-province/import', '/out-of-province/new']) {
      expect(canAccessPath(path, adminRoles), path).toBe(true);
      expect(canAccessPath(path, leaderRoles), path).toBe(true);
      expect(canAccessPath(path, memberRoles), path).toBe(true);
      expect(canAccessPath(path, backendRoles), path).toBe(false);
    }
  });

  it('opens independent in-service and resignation-certificate routes while keeping historical placeholders frozen', () => {
    const adminRoles = roles([ROLE.ADMIN]);
    const ownerRoles = roles([ROLE.BUSINESS_OWNER]);
    const leaderRoles = roles([ROLE.BUSINESS_GROUP_LEADER]);
    const memberRoles = roles([ROLE.BUSINESS_GROUP_MEMBER]);
    const contractRoles = roles([ROLE.LABOR_CONTRACT_MEMBER]);
    const sharedOwnerRoles = roles([ROLE.SHARED_TEAM_OWNER]);
    const socialRoles = roles([ROLE.SOCIAL_INSURANCE_SPECIALIST]);

    expect(canAccessPath('/in-service', adminRoles)).toBe(true);
    expect(canAccessPath('/in-service/new', memberRoles)).toBe(true);
    expect(canAccessPath('/in-service/order-1', contractRoles)).toBe(true);
    expect(canAccessPath('/in-service/order-1/audit', ownerRoles)).toBe(true);
    expect(canAccessPath('/in-service/order-1/audit', leaderRoles)).toBe(true);
    expect(canAccessPath('/in-service/order-1/audit', memberRoles)).toBe(false);

    expect(canAccessPath('/renewal', adminRoles)).toBe(true);
    expect(canAccessPath('/renewal/new', memberRoles)).toBe(true);
    expect(canAccessPath('/renewal/order-1', contractRoles)).toBe(true);
    expect(canAccessPath('/in-service/certificates', contractRoles)).toBe(true);
    expect(canAccessPath('/in-service/certificates/new', memberRoles)).toBe(true);
    expect(canAccessPath('/in-service/certificates/new', contractRoles)).toBe(false);
    expect(canAccessPath('/resignation-certificates', contractRoles)).toBe(true);
    expect(canAccessPath('/resignation-certificates', sharedOwnerRoles)).toBe(true);
    expect(canAccessPath('/resignation-certificates', socialRoles)).toBe(false);
    expect(canAccessPath('/resignation-certificates/new', memberRoles)).toBe(true);
    expect(canAccessPath('/resignation-certificates/new', contractRoles)).toBe(false);

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

    expect(canAccessPath('/my-work/team', ownerRoles, broadPermissions)).toBe(false);
    expect(canAccessPath('/my-work/history', ownerRoles, broadPermissions)).toBe(false);
    expect(canAccessPath('/work-orders', ownerRoles, broadPermissions)).toBe(false);
    expect(canAccessPath('/my-work/initiated', ownerRoles, broadPermissions)).toBe(false);
    expect(canAccessPath('/my-work/pending', ownerRoles, broadPermissions)).toBe(false);
    expect(canAccessPath('/onboarding/contract', ownerRoles, broadPermissions)).toBe(false);
    expect(canAccessPath('/offboarding/contact-pool', ownerRoles, broadPermissions)).toBe(false);

    expect(canAccessPath('/my-work/team', leaderRoles, broadPermissions)).toBe(false);
    expect(canAccessPath('/work-orders', leaderRoles, broadPermissions)).toBe(true);
    expect(canAccessPath('/work-orders/import', leaderRoles, broadPermissions)).toBe(true);
    expect(canAccessPath('/my-work/initiated', leaderRoles, broadPermissions)).toBe(false);
    expect(canAccessPath('/my-work/returned', leaderRoles, broadPermissions)).toBe(false);
    expect(canAccessPath('/my-work/pending', leaderRoles, broadPermissions)).toBe(false);
    expect(canAccessPath('/my-work/done', leaderRoles, broadPermissions)).toBe(false);
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

  it('keeps query-string last-path checks within the same visibility matrix', () => {
    const memberRoles = roles([ROLE.BUSINESS_GROUP_MEMBER]);
    const ownerRoles = roles([ROLE.BUSINESS_OWNER]);

    expect(canAccessPath('/work-orders?orderType=onboarding&page=2', memberRoles)).toBe(true);
    expect(canAccessPath('/my-dispatched/child-1?tab=logs', memberRoles)).toBe(true);
    expect(canAccessPath('/work-orders/wo-1?tab=detail', ownerRoles)).toBe(false);
  });

  it('does not expose notification route to business owner only role', () => {
    expect(canAccessPath('/notifications', roles([ROLE.BUSINESS_OWNER]))).toBe(false);
    expect(canAccessPath('/notifications', roles([ROLE.BUSINESS_GROUP_MEMBER]))).toBe(true);
    expect(canAccessPath('/notifications', roles([ROLE.LABOR_CONTRACT_MEMBER]))).toBe(true);
  });
});


describe('routeVisibility structured permission baseline', () => {
  const structuredBaselineCases: Array<{ label: string; roleCode: string; canonicalRole: string; paths: string[] }> = [
    {
      label: '?????',
      roleCode: 'biz_manager',
      canonicalRole: ROLE.BUSINESS_OWNER,
      paths: ['/dashboard', '/notifications', '/work-orders', '/work-orders/create', '/work-orders/import', '/work-orders/wo-1', '/my-dispatched/child-1', '/onboarding/contract', '/dashboards/leader'],
    },
    {
      label: '????',
      roleCode: 'biz_leader',
      canonicalRole: ROLE.BUSINESS_GROUP_LEADER,
      paths: ['/dashboard', '/notifications', '/work-orders', '/work-orders/create', '/work-orders/import', '/work-orders/wo-1', '/my-dispatched/child-1', '/onboarding/contract', '/onboarding/onboarding_contact', '/onboarding/data_entry', '/onboarding/social_insurance', '/onboarding/resignation_contact', '/onboarding/data_entry_resign', '/onboarding/social_insurance_resign', '/dashboards/leader'],
    },
    {
      label: '???',
      roleCode: 'biz_member',
      canonicalRole: ROLE.BUSINESS_GROUP_MEMBER,
      paths: ['/dashboard', '/notifications', '/work-orders', '/work-orders/create', '/work-orders/import', '/work-orders/wo-1', '/my-dispatched/child-1', '/onboarding/contract', '/onboarding/onboarding_contact', '/onboarding/data_entry', '/onboarding/social_insurance', '/onboarding/resignation_contact', '/onboarding/data_entry_resign', '/onboarding/social_insurance_resign', '/dashboards/leader'],
    },
    {
      label: '???????',
      roleCode: 'shared_leader',
      canonicalRole: ROLE.SHARED_TEAM_OWNER,
      paths: ['/dashboard', '/notifications', '/my-dispatched/child-1', '/onboarding', '/onboarding/contract', '/onboarding/onboarding_contact', '/onboarding/resignation_contact', '/offboarding', '/offboarding/contact-pool', '/onboarding/data_entry', '/onboarding/social_insurance', '/offboarding/social-suspend-pool', '/dashboards/leader'],
    },
    {
      label: '????',
      roleCode: 'contract_specialist',
      canonicalRole: ROLE.LABOR_CONTRACT_MEMBER,
      paths: ['/dashboard', '/notifications', '/my-dispatched/child-1', '/onboarding', '/onboarding/contract', '/onboarding/onboarding_contact', '/onboarding/data_entry', '/onboarding/social_insurance', '/dashboards/leader'],
    },
    {
      label: '???????',
      roleCode: 'onboarding_specialist',
      canonicalRole: ROLE.ONBOARDING_RESIGNATION_MEMBER,
      paths: ['/dashboard', '/notifications', '/my-dispatched/child-1', '/onboarding', '/onboarding/onboarding_contact', '/onboarding/resignation_contact', '/offboarding/contact-pool', '/onboarding/contract', '/onboarding/data_entry', '/dashboards/leader'],
    },
    {
      label: '??????',
      roleCode: 'data_entry_leader',
      canonicalRole: ROLE.DATA_ENTRY_LEADER,
      paths: ['/dashboard', '/notifications', '/my-dispatched/child-1', '/onboarding', '/onboarding/data_entry', '/onboarding/data_entry_resign', '/offboarding/social-suspend-pool', '/onboarding/contract', '/onboarding/social_insurance', '/dashboards/leader'],
    },
    {
      label: '?????',
      roleCode: 'social_insurance_specialist',
      canonicalRole: ROLE.SOCIAL_INSURANCE_SPECIALIST,
      paths: ['/dashboard', '/notifications', '/my-dispatched/child-1', '/onboarding', '/onboarding/social_insurance', '/onboarding/social_insurance_resign', '/offboarding/social-insurance-resign-pool', '/onboarding/contract', '/onboarding/data_entry', '/dashboards/leader'],
    },
  ];

  it.each(structuredBaselineCases)('keeps %s route results unchanged when structured permissions are present', ({ roleCode, canonicalRole, paths }) => {
    const userRoles = roles([canonicalRole]);
    const permissions = DEFAULT_MATRIX[roleCode] || [];
    for (const path of paths) {
      expect(canAccessPath(path, userRoles, permissions), path).toBe(canAccessPath(path, userRoles));
    }
  });

  it('keeps multi-role structured route permissions as role union', () => {
    const multiRoles = roles([ROLE.SHARED_TEAM_OWNER, ROLE.LABOR_CONTRACT_MEMBER, ROLE.DATA_ENTRY_LEADER]);
    const permissions = Array.from(new Set([
      ...DEFAULT_MATRIX.shared_leader,
      ...DEFAULT_MATRIX.contract_specialist,
      ...DEFAULT_MATRIX.data_entry_leader,
    ]));

    expect(canAccessPath('/onboarding/contract', multiRoles, permissions)).toBe(true);
    expect(canAccessPath('/onboarding/data_entry', multiRoles, permissions)).toBe(true);
    expect(canAccessPath('/offboarding/social-suspend-pool', multiRoles, permissions)).toBe(true);
    expect(canAccessPath('/onboarding/social_insurance', multiRoles, permissions)).toBe(false);
  });

  it('keeps phase-1 hidden routes blocked even if structured permissions are broad', () => {
    const adminRoles = roles([ROLE.ADMIN]);
    const adminPermissions = DEFAULT_MATRIX.admin;
    expect(canAccessPath('/onboarding/renewal_contract', adminRoles, adminPermissions)).toBe(false);
    expect(canAccessPath('/onboarding/benefit_apply', adminRoles, adminPermissions)).toBe(false);
    expect(canAccessPath('/in-service/contract-renewal', adminRoles, adminPermissions)).toBe(false);
  });
});
