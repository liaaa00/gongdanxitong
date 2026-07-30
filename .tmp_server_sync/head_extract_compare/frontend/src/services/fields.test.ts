import { describe, expect, it } from 'vitest';
import { getFallbackFields } from './fields';

describe('field fallback configuration', () => {
  it('keeps onboarding other salary fields as text with explicit input hints', () => {
    const fields = getFallbackFields('onboarding');
    const byCode = new Map(fields.map((field) => [field.field_code, field]));

    expect(byCode.get('other_salary')).toMatchObject({
      field_type: 'text',
      help_text: '可填写文字说明，如可填写数字加文字。',
    });
    expect(byCode.get('probation_other_salary')).toMatchObject({
      field_type: 'text',
      help_text: '可填写文字说明，如可填写数字加文字。',
    });
  });

  it('documents company address requirement by esign platform in fallback fields', () => {
    const fields = getFallbackFields('onboarding');
    const companyAddress = fields.find((field) => field.field_code === 'company_address');

    expect(companyAddress).toMatchObject({
      field_type: 'text',
      help_text: '电子签平台为速创时非必填；电子签平台为E签宝时必填',
    });
  });

  it.each(['onboarding', 'resignation'])('keeps social handling result fields in %s fallback fields', (orderType) => {
    const fields = getFallbackFields(orderType);
    const byCode = new Map(fields.map((field) => [field.field_code, field]));

    expect(byCode.get('social_insurance_result')).toMatchObject({ field_name: '社保是否办结', field_type: 'dropdown' });
    expect(byCode.get('medical_insurance_result')).toMatchObject({ field_name: '医保是否办结', field_type: 'dropdown' });
    expect(byCode.get('housing_fund_result')).toMatchObject({ field_name: '公积金是否办结', field_type: 'dropdown' });
    expect(byCode.get('social_insurance_remark')).toMatchObject({ field_name: '社保公积金办理备注', field_type: 'text' });
  });
});
