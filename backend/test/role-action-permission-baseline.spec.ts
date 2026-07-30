import { DEFAULT_ROLE_ACTION_PERMISSIONS, ROLE_ACTIONS } from 'src/modules/role-action-permissions/role-action-permission.service';

describe('role action permission default baseline', () => {
  const actionsOf = (roleCode: string) => new Set(DEFAULT_ROLE_ACTION_PERMISSIONS[roleCode] || []);

  it('keeps admin on all action codes', () => {
    expect(actionsOf('admin')).toEqual(new Set(ROLE_ACTIONS));
  });

  it('keeps business roles urge-only for dispatched-order batch operations', () => {
    for (const roleCode of ['biz_leader', 'biz_member']) {
      const actions = actionsOf(roleCode);
      expect(actions.has('dispatched_order.batch_urge')).toBe(true);
      expect(actions.has('module.contract.manage')).toBe(false);
      expect(actions.has('module.onboarding_contact.manage')).toBe(false);
      expect(actions.has('module.data_entry.manage')).toBe(false);
      expect(actions.has('module.social_insurance.manage')).toBe(false);
      expect(actions.has('dispatched_order.batch_import')).toBe(false);
      expect(actions.has('dispatched_order.batch_accept')).toBe(false);
      expect(actions.has('dispatched_order.batch_complete')).toBe(false);
      expect(actions.has('dispatched_order.batch_feedback')).toBe(false);
    }
  });

  it('keeps backend module roles on their own module operations', () => {
    for (const action of [
      'module.contract.manage',
      'dispatched_order.batch_import',
      'dispatched_order.batch_export',
      'dispatched_order.batch_accept',
      'dispatched_order.batch_complete',
    ] as const) expect(actionsOf('contract_specialist').has(action)).toBe(true);
    for (const action of [
      'module.onboarding_contact.manage',
      'module.resignation_contact.manage',
      'dispatched_order.batch_import_fields',
      'dispatched_order.batch_complete',
    ] as const) expect(actionsOf('onboarding_specialist').has(action)).toBe(true);
    for (const action of [
      'module.data_entry.manage',
      'module.data_entry_resign.manage',
      'dispatched_order.batch_complete',
    ] as const) expect(actionsOf('data_entry_leader').has(action)).toBe(true);
    for (const action of [
      'module.social_insurance.manage',
      'module.social_insurance_resign.manage',
      'dispatched_order.batch_feedback',
    ] as const) expect(actionsOf('social_insurance_specialist').has(action)).toBe(true);
    expect(actionsOf('social_insurance_specialist').has('dispatched_order.batch_complete')).toBe(false);
  });

  it('keeps multi-role effective permissions as a union of role actions', () => {
    const union = new Set([
      ...DEFAULT_ROLE_ACTION_PERMISSIONS.shared_leader,
      ...DEFAULT_ROLE_ACTION_PERMISSIONS.contract_specialist,
      ...DEFAULT_ROLE_ACTION_PERMISSIONS.data_entry_leader,
    ]);

    expect(union.has('module.contract.manage')).toBe(true);
    expect(union.has('module.onboarding_contact.manage')).toBe(true);
    expect(union.has('module.data_entry.manage')).toBe(true);
    expect(union.has('module.social_insurance.manage')).toBe(false);
  });
});
