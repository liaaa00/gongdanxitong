import { describe, expect, it } from 'vitest';
import {
  buildDetailTemplateFieldList,
  getDefaultDetailFieldGroups,
  getDetailTemplateFieldCodes,
  parseDetailTemplateGroups,
} from './detailViewTemplateLayout';

describe('detail view template layout', () => {
  it('keeps group markers out of the configured field codes', () => {
    const fieldList = [
      { kind: 'group', value: '入职材料收集' },
      { kind: 'field', fieldCode: 'need_onboarding_contact' },
      { kind: 'field', fieldCode: 'is_common_template' },
    ];

    expect(getDetailTemplateFieldCodes(fieldList)).toEqual([
      'need_onboarding_contact',
      'is_common_template',
    ]);
    expect(parseDetailTemplateGroups(fieldList)).toEqual([{
      title: '入职材料收集',
      fieldCodes: ['need_onboarding_contact', 'is_common_template'],
    }]);
  });

  it('serializes group order, field order and ungrouped fields without duplication', () => {
    expect(buildDetailTemplateFieldList(
      ['employee_name', 'template_name', 'need_onboarding_contact'],
      [
        { title: '入职材料收集', fieldCodes: ['need_onboarding_contact', 'template_name'] },
        { title: '基础信息', fieldCodes: ['employee_name', 'template_name'] },
      ],
    )).toEqual([
      { kind: 'group', value: '入职材料收集' },
      { fieldCode: 'need_onboarding_contact', kind: 'field' },
      { fieldCode: 'template_name', kind: 'field' },
      { kind: 'group', value: '基础信息' },
      { fieldCode: 'employee_name', kind: 'field' },
    ]);
  });

  it('classifies onboarding material fields outside resignation and feedback groups', () => {
    const groups = getDefaultDetailFieldGroups('data_entry');

    expect(groups.find((group) => group.title === '入职材料收集')?.fieldCodes)
      .toEqual(expect.arrayContaining(['need_onboarding_contact', 'is_common_template', 'template_name']));
    expect(groups.find((group) => group.title === '离职信息')?.fieldCodes)
      .not.toEqual(expect.arrayContaining(['is_common_template', 'template_name']));
    expect(groups.find((group) => group.title === '办理反馈')?.fieldCodes)
      .toContain('data_entry_feedback');
  });

  it('keeps onboarding contact groups intact for the onboarding module', () => {
    const groups = getDefaultDetailFieldGroups('onboarding_contact');

    expect(groups.find((group) => group.title === '入职材料收集')).toBeDefined();
    expect(groups.find((group) => group.title === '离职材料收集')).toBeUndefined();
  });

  it('relables material feedback groups for resignation contact without onboarding wording', () => {
    // 任务6：离职材料收集不得再复用「入职材料收集」分组文案。
    const groups = getDefaultDetailFieldGroups('resignation_contact');

    expect(groups.find((group) => group.title === '入职材料收集')).toBeUndefined();
    const feedbackGroup = groups.find((group) => group.title === '离职材料收集');
    expect(feedbackGroup?.fieldCodes).toContain('resignation_contact_feedback');
    // 任务3：快递单号归入离职信息分组并跟在共享收集字段之后。
    const resignationGroup = groups.find((group) => group.title === '离职信息');
    expect(resignationGroup?.fieldCodes).toEqual(expect.arrayContaining(['need_resignation_share', 'resignation_cert_tracking_number']));
    expect(resignationGroup?.fieldCodes?.[0]).toBe('need_resignation_share');
  });
});
