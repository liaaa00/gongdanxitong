import { describe, it, expect } from 'vitest';

/**
 * 测试完成工单弹窗状态选项逻辑
 * 对应修复：非社保模块只显示"已办结"选项
 */
describe('完成工单弹窗 - 状态选项逻辑', () => {
  const isSocialInsuranceModule = (moduleCode: string | undefined) => {
    return ['SOCIAL_INSURANCE', 'PROVIDENT_FUND'].includes(moduleCode ?? '');
  };

  it('社保模块应返回 true', () => {
    expect(isSocialInsuranceModule('SOCIAL_INSURANCE')).toBe(true);
    expect(isSocialInsuranceModule('PROVIDENT_FUND')).toBe(true);
  });

  it('非社保模块应返回 false', () => {
    expect(isSocialInsuranceModule('RESIGNATION_CONTACT')).toBe(false);
    expect(isSocialInsuranceModule('RESIGNATION_MATERIALS')).toBe(false);
    expect(isSocialInsuranceModule('LABOR_CONTRACT')).toBe(false);
    expect(isSocialInsuranceModule('SALARY')).toBe(false);
  });

  it('undefined 或空值应返回 false', () => {
    expect(isSocialInsuranceModule(undefined)).toBe(false);
    expect(isSocialInsuranceModule('')).toBe(false);
  });

  it('社保模块应有三个状态选项', () => {
    const moduleCode = 'SOCIAL_INSURANCE';
    const statusOptions = isSocialInsuranceModule(moduleCode)
      ? [
          { label: '已办结', value: 'COMPLETED' },
          { label: '办理中', value: 'IN_PROGRESS' },
          { label: '未办', value: 'NOT_HANDLED' },
        ]
      : [{ label: '已办结', value: 'COMPLETED' }];

    expect(statusOptions).toHaveLength(3);
    expect(statusOptions.map(opt => opt.label)).toEqual(['已办结', '办理中', '未办']);
  });

  it('非社保模块应只有已办结选项', () => {
    const moduleCode = 'RESIGNATION_CONTACT';
    const statusOptions = isSocialInsuranceModule(moduleCode)
      ? [
          { label: '已办结', value: 'COMPLETED' },
          { label: '办理中', value: 'IN_PROGRESS' },
          { label: '未办', value: 'NOT_HANDLED' },
        ]
      : [{ label: '已办结', value: 'COMPLETED' }];

    expect(statusOptions).toHaveLength(1);
    expect(statusOptions[0].label).toBe('已办结');
  });
});
