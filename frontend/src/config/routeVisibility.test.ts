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

  it('allows admin to access action-matrix controlled work-order routes even without cached action permissions', () => {
    const adminRoles = roles([ROLE.ADMIN]);
    expect(canAccessPath('/work-orders', adminRoles, [])).toBe(true);
    expect(canAccessPath('/my-work/initiated', adminRoles, [])).toBe(true);
    expect(canAccessPath('/my-work/pending', adminRoles, [])).toBe(true);
    expect(canAccessPath('/my-work/team', adminRoles, [])).toBe(true);
    expect(canAccessPath('/my-work/history', adminRoles, [])).toBe(true);
    expect(canAccessPath('/my-dispatched/123', adminRoles, [])).toBe(true);
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
});
