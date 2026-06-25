import { describe, expect, it, vi } from 'vitest';
import {
  buildExportFieldOptions,
  buildTemplateFieldPayload,
  createTemplateField,
  normalizeTemplateFields,
  type SelectedField,
} from './fieldList';

const allFields = [
  { code: 'employee_name', name: '员工姓名' },
  { code: 'id_card_no', name: '证件号码' },
];

describe('export template field list helpers', () => {
  it('normalizes business fields and const template columns from existing templates', () => {
    const result = normalizeTemplateFields([
      { fieldCode: 'employee_name', alias: '姓名', order: 1 },
      { const: '', alias: '电脑号', order: 2 },
      { const: '新签', alias: '签订方式', order: 3 },
    ], allFields);

    expect(result.map((item) => item.kind)).toEqual(['field', 'empty', 'default']);
    expect(result[0]).toMatchObject({ field_code: 'employee_name', alias: '姓名' });
    expect(result[1]).toMatchObject({ alias: '电脑号', const_value: '' });
    expect(result[2]).toMatchObject({ alias: '签订方式', const_value: '新签' });
  });

  it('builds payload for business, empty and default columns', () => {
    const fields: SelectedField[] = [
      { id: 'a', kind: 'field', field_code: 'employee_name', alias: '姓名', order: 1 },
      { id: 'b', kind: 'empty', alias: '电脑号', const_value: '', order: 2 },
      { id: 'c', kind: 'default', alias: '签订方式', const_value: '新签', order: 3 },
    ];

    expect(buildTemplateFieldPayload(fields)).toEqual([
      { field_code: 'employee_name', alias: '姓名', order: 1 },
      { alias: '电脑号', order: 2, const: '' },
      { alias: '签订方式', order: 3, const: '新签' },
    ]);
  });

  it('keeps rich header metadata when alias is unchanged and drops it when alias is changed', () => {
    const normalized = normalizeTemplateFields([
      { const: '甲方', alias: '工资支付方', header: ['工资支付方', '默认甲方'], order: 1 },
      { fieldCode: 'id_card_no', alias: '证件号码', header: ['证件号码'], order: 2 },
    ], allFields);

    expect(buildTemplateFieldPayload(normalized)[0]).toMatchObject({ alias: '工资支付方', header: ['工资支付方', '默认甲方'], const: '甲方' });

    const changed = normalized.map((item, index) => index === 0 ? { ...item, alias: '支付方' } : item);
    expect(buildTemplateFieldPayload(changed)[0]).toEqual({ alias: '支付方', order: 1, const: '甲方' });
  });

  it('creates deterministic template column defaults when Date and Math are mocked', () => {
    vi.spyOn(Date, 'now').mockReturnValue(123);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    expect(createTemplateField('empty', 1)).toMatchObject({ id: 'empty-123-i', kind: 'empty', alias: '空值字段', const_value: '', order: 1 });
    expect(createTemplateField('default', 2)).toMatchObject({ id: 'default-123-i', kind: 'default', alias: '默认值字段', const_value: '', order: 2 });

    vi.restoreAllMocks();
  });

  it('builds export field groups from system fields and keeps export-only creator field', () => {
    const groups = buildExportFieldOptions([
      {
        field_code: 'employee_name',
        field_name: '姓名',
        order_type: 'onboarding',
        sub_ticket_scope: 'all',
        collection_group: '基础信息',
        business_context: ['onboarding'],
        display_order: 6,
        is_active: true,
      },
      {
        field_code: 'id_card_no',
        field_name: '身份证号码',
        order_type: 'onboarding',
        sub_ticket_scope: 'all',
        collection_group: '基础信息',
        business_context: ['onboarding'],
        display_order: 7,
        is_active: true,
      },
    ], 'contract');

    const fields = groups.flatMap((group) => group.fields);
    expect(fields.map((field) => field.code)).toEqual(expect.arrayContaining(['created_by_name', 'employee_name', 'id_card_no']));
    expect(fields.find((field) => field.code === 'created_by_name')).toMatchObject({ name: '发起人', virtual: true });
    expect(fields.find((field) => field.code === 'id_card_no')?.name).toBe('证件号码');
  });

  it('prioritizes fields relevant to the selected module and places unrelated fields under other groups', () => {
    const groups = buildExportFieldOptions([
      {
        field_code: 'contract_start_date',
        field_name: '合同开始日期',
        order_type: 'onboarding',
        sub_ticket_scope: 'contract',
        collection_group: '劳动合同新签',
        business_context: ['onboarding'],
        display_order: 1,
        is_active: true,
      },
      {
        field_code: 'social_stop_month',
        field_name: '社保公积金停保月',
        order_type: 'resignation',
        sub_ticket_scope: 'resignation_social_insurance',
        collection_group: '离职减员',
        business_context: ['resignation'],
        display_order: 1,
        is_active: true,
      },
      {
        field_code: 'disabled_field',
        field_name: '停用字段',
        order_type: 'onboarding',
        sub_ticket_scope: 'contract',
        collection_group: '劳动合同新签',
        display_order: 2,
        is_active: false,
      },
    ], 'contract');

    const groupNames = groups.map((group) => group.group);
    expect(groupNames).toContain('劳动合同新签');
    expect(groupNames).toContain('其他字段 / 离职减员');
    expect(groups.find((group) => group.group === '劳动合同新签')?.fields.map((field) => field.code)).toContain('contract_start_date');
    expect(groups.flatMap((group) => group.fields).map((field) => field.code)).not.toContain('disabled_field');
  });
});
