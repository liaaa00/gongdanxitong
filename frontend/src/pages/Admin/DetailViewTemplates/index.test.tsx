import { describe, expect, it } from 'vitest';
import { createInitialFieldGroups, MODULE_SELECT_GROUPS } from './index';

describe('详情页字段配置模块选项', () => {
  it('包含在职、续签、证明、离职证明和省外模块', () => {
    const values = MODULE_SELECT_GROUPS.flatMap((group) => group.options.map((option) => option.value));

    expect(values).toEqual(expect.arrayContaining([
      'in_service_single_business',
      'renewal_contract',
      'in_service_certificate',
      'resignation_cert',
      'out_of_province_increase',
      'out_of_province_decrease',
      'out_of_province_single_business',
    ]));
  });

  it('把旧增员报岗模板的材料字段归到入职材料收集', () => {
    const groups = createInitialFieldGroups(
      'data_entry',
      ['need_onboarding_contact', 'is_common_template', 'template_name', 'data_entry_feedback'],
      [],
    );

    expect(groups.find((group) => group.title === '入职材料收集')?.fieldCodes)
      .toEqual(['need_onboarding_contact', 'is_common_template', 'template_name']);
    expect(groups.find((group) => group.title === '办理反馈')?.fieldCodes)
      .toEqual(['data_entry_feedback']);
    expect(groups.find((group) => group.title === '离职信息')).toBeUndefined();
  });
});
