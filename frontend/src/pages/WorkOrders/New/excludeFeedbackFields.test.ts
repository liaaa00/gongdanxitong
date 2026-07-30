import { describe, it, expect } from 'vitest';
import {
  AGENT_INITIATED_EXCLUDED_FIELD_CODES,
  CONDITIONAL_REQUIRED_BY_TYPE,
  canCreateMainWorkOrderByRole,
  excludeBackofficeFeedbackFields,
  isReadonlyBusinessViewer,
} from './index';
import { getFallbackFields } from '@/services/fields';

describe('single create form field and role rules', () => {
  it('keeps the backend feedback exclusion set aligned with onboarding import fields', () => {
    expect([...AGENT_INITIATED_EXCLUDED_FIELD_CODES].sort()).toEqual(
      ['contract_feedback', 'data_entry_feedback', 'onboarding_feedback'],
    );
  });

  it('removes backend feedback fields from onboarding field set', () => {
    const all = getFallbackFields('onboarding');
    const codesBefore = all.map((f) => f.field_code);
    expect(codesBefore).toContain('contract_feedback');
    expect(codesBefore).toContain('onboarding_feedback');
    expect(codesBefore).toContain('data_entry_feedback');

    const filtered = excludeBackofficeFeedbackFields(all);
    const codesAfter = filtered.map((f) => f.field_code);
    expect(codesAfter).not.toContain('contract_feedback');
    expect(codesAfter).not.toContain('onboarding_feedback');
    expect(codesAfter).not.toContain('data_entry_feedback');
  });

  it('does not remove business-initiation fields', () => {
    const filtered = excludeBackofficeFeedbackFields(getFallbackFields('onboarding'));
    const codes = filtered.map((f) => f.field_code);
    expect(codes).toContain('contract_template');
    expect(codes).toContain('payroll_location');
    expect(codes).toContain('special_remark');
    expect(codes).toContain('need_onboarding_contact');
  });

  it('keeps onboarding conditional required rules aligned with the latest business requirements', () => {
    expect(CONDITIONAL_REQUIRED_BY_TYPE.onboarding).toEqual(expect.arrayContaining([
      { field: 'need_onboarding_contact', value: '否', requireFields: ['current_address'] },
      { field: 'probation_start_date', operator: 'exists', requireFields: ['probation_months', 'probation_end_date', 'probation_salary'] },
    ]));

    const byCode = new Map(getFallbackFields('onboarding').map((field) => [field.field_code, field]));
    expect(byCode.get('current_address')?.conditional_required).toEqual({ op: 'EQ', field: 'need_onboarding_contact', value: '否' });
    expect(byCode.get('probation_start_date')).toMatchObject({ is_required: false, default_required: false });
    for (const fieldCode of ['probation_months', 'probation_end_date', 'probation_salary']) {
      expect(byCode.get(fieldCode)).toMatchObject({
        is_required: false,
        default_required: false,
        conditional_required: { op: 'EXISTS', field: 'probation_start_date' },
      });
    }
  });

  it('does not change resignation fields', () => {
    const resignation = getFallbackFields('resignation');
    const filtered = excludeBackofficeFeedbackFields(resignation);
    expect(filtered.length).toBe(resignation.length);
  });

  it('allows business members and group leaders to create onboarding/resignation main work orders', () => {
    const makeHasRole = (roles: string[]) => (roleCode: string) => roles.includes(roleCode);

    expect(canCreateMainWorkOrderByRole(makeHasRole(['business_group_member']))).toBe(true);
    expect(canCreateMainWorkOrderByRole(makeHasRole(['business_group_leader']))).toBe(true);
    expect(canCreateMainWorkOrderByRole(makeHasRole(['business_owner']))).toBe(false);

    expect(isReadonlyBusinessViewer(makeHasRole(['business_owner']))).toBe(true);
    expect(isReadonlyBusinessViewer(makeHasRole(['business_owner', 'business_group_member']))).toBe(false);
    expect(isReadonlyBusinessViewer(makeHasRole(['business_owner', 'business_group_leader']))).toBe(false);
  });
});
