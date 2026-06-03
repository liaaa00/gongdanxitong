import { describe, expect, it } from 'vitest';
import { ROLE } from '@/constants/roles';
import { canAccessModuleCode, getAccessibleModuleCodes, getPhase1ModuleDisplayName, isPhase1VisibleModule } from './moduleAccess';

const roles = (codes: string[]) => codes.map((code) => ({ code }));

describe('moduleAccess phase-1 visibility', () => {
  it('uses 0603 sub-work-order display names', () => {
    expect(getPhase1ModuleDisplayName('contract')).toBe('劳动合同新签');
    expect(getPhase1ModuleDisplayName('data_entry')).toBe('增员报岗录入');
    expect(getPhase1ModuleDisplayName('social_insurance')).toBe('社保公积金增员');
    expect(getPhase1ModuleDisplayName('data_entry_resign')).toBe('减员报岗录入');
    expect(getPhase1ModuleDisplayName('social_insurance_resign')).toBe('社保公积金减员');
    expect(getPhase1ModuleDisplayName('resignation_social_insurance')).toBe('社保公积金减员');
  });

  it('hides in-service modules in phase 1', () => {
    expect(isPhase1VisibleModule('renewal_contract')).toBe(false);
    expect(isPhase1VisibleModule('benefit_apply')).toBe(false);
    expect(isPhase1VisibleModule('social_insurance_change')).toBe(false);
  });

  it('maps social insurance specialist to increase/decrease only', () => {
    const socialRoles = roles([ROLE.SOCIAL_INSURANCE_SPECIALIST]);
    expect(canAccessModuleCode('social_insurance', socialRoles)).toBe(true);
    expect(canAccessModuleCode('social_insurance_resign', socialRoles)).toBe(true);
    expect(canAccessModuleCode('resignation_social_insurance', socialRoles)).toBe(true);
    expect(canAccessModuleCode('onboarding_contact', socialRoles)).toBe(false);
    expect(canAccessModuleCode('contract', socialRoles)).toBe(false);
    expect(canAccessModuleCode('data_entry', socialRoles)).toBe(false);
  });

  it('prefers explicit backend module permission fields for backend roles', () => {
    const contractRoles = roles([ROLE.LABOR_CONTRACT_MEMBER]);
    const modules = getAccessibleModuleCodes(contractRoles, ['module:social_insurance:view']);
    expect(modules && Array.from(modules)).toEqual(['social_insurance']);
  });
});
