import { describe, expect, it } from 'vitest';
import { MODULE_SELECT_GROUPS } from './index';

describe('详情页字段配置模块选项', () => {
  it('包含在职、续签、证明、离职证明和省外模块', () => {
    const values = MODULE_SELECT_GROUPS.flatMap((group) => group.options.map((option) => option.value));

    expect(values).toEqual(expect.arrayContaining([
      'in_service_single_business',
      'renewal_contract',
      'in_service_certificate',
      'resignation_certificate',
      'out_of_province_increase',
      'out_of_province_decrease',
      'out_of_province_single_business',
    ]));
  });
});
