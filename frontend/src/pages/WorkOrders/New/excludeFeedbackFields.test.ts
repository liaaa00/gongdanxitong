import { describe, it, expect } from 'vitest';
import { AGENT_INITIATED_EXCLUDED_FIELD_CODES, excludeBackofficeFeedbackFields } from './index';
import { getFallbackFields } from '@/services/fields';

describe('单条新增表单：排除后道办理岗反馈字段（业务规则清单 17）', () => {
  it('排除集合与入职导入模板保持一致的三个反馈字段', () => {
    expect([...AGENT_INITIATED_EXCLUDED_FIELD_CODES].sort()).toEqual(
      ['contract_feedback', 'data_entry_feedback', 'onboarding_feedback'],
    );
  });

  it('从入职字段全集中剔除三个反馈字段', () => {
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

  it('不误伤发起阶段字段（劳动合同模板、发薪地、特殊备注等保留）', () => {
    const filtered = excludeBackofficeFeedbackFields(getFallbackFields('onboarding'));
    const codes = filtered.map((f) => f.field_code);
    expect(codes).toContain('contract_template');
    expect(codes).toContain('payroll_location');
    expect(codes).toContain('special_remark');
    expect(codes).toContain('need_onboarding_contact');
  });

  it('对离职字段无副作用', () => {
    const resignation = getFallbackFields('resignation');
    const filtered = excludeBackofficeFeedbackFields(resignation);
    expect(filtered.length).toBe(resignation.length);
  });
});
