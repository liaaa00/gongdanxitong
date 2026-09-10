import { describe, expect, it } from 'vitest';
import { normalizePortalIntakeValues } from './portalIntakeValues';

const field = (fieldCode: string, options: Array<{ label: string; value: string }>) => ({
  field_code: fieldCode, field_type: 'dropdown' as const, dropdown_options: options,
});
const choices = (values: string[]) => values.map((value) => ({ label: value, value }));

describe('门户审核草稿布尔值', () => {
  it.each([
    { options: ['是', '否'], expected: ['是', '否'] },
    { options: ['1.是', '2.否'], expected: ['1.是', '2.否'] },
    { options: ['1、是', '2、否'], expected: ['1、是', '2、否'] },
  ])('按动态选项 $options 映射 true 和 false', ({ options, expected }) => {
    const values = Object.freeze({ yes: true, no: false });
    expect(normalizePortalIntakeValues(values, [field('yes', choices(options)), field('no', choices(options))]))
      .toEqual({ yes: expected[0], no: expected[1] });
    expect(values).toEqual({ yes: true, no: false });
  });

  it('使用选项的实际值，支持值和显示文案不相同', () => {
    expect(normalizePortalIntakeValues({ need: false }, [field('need', [
      { label: '是', value: 'enabled' }, { label: '否', value: 'disabled' },
    ])])).toEqual({ need: 'disabled' });
  });

  it('保留人工选择、空字段、非下拉字段及没有明确是否含义的值', () => {
    const values = { manual: '2.否', empty: null, text: false, other: false, portal_configuration_pending: false };
    expect(normalizePortalIntakeValues(values, [
      field('manual', choices(['是', '否'])), field('empty', choices(['是', '否'])),
      field('missing', choices(['是', '否'])), field('other', choices(['A', 'B'])),
      { ...field('text', choices(['是', '否'])), field_type: 'text' },
    ])).toEqual(values);
  });
});
