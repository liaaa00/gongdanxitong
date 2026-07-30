import { describe, expect, it } from 'vitest';
import { IN_SERVICE_ORDER_KINDS } from '@/constants/inService';
import type { ImportTemplateFieldItem } from '@/services/importTemplates';
import {
  RENEWAL_SIGNING_METHOD,
  buildRenewalConfiguredFields,
  isRenewalFieldRequired,
  normalizeInServiceOrderFormValues,
} from './InServiceOrderForm';

const field = (
  fieldCode: string,
  fieldName: string,
  fieldType: ImportTemplateFieldItem['field_type'] = 'text',
): ImportTemplateFieldItem => ({
  id: fieldCode,
  field_code: fieldCode,
  field_name: fieldName,
  field_type: fieldType,
  is_required: false,
  default_required: false,
  conditional_required: null,
  validation_regex: null,
  validation_msg: null,
  dropdown_options: null,
  placeholder: null,
  help_text: null,
  order_type: 'onboarding',
  display_order: 1,
  is_active: true,
  header_alias: null,
  is_required_override: null,
});

describe('InServiceOrderForm renewal rules', () => {
  it('combines legacy renewal fields with configured new-contract fields', () => {
    const result = buildRenewalConfiguredFields(
      [field('renewal_reason', '续签原因')],
      [
        field('contract_term_type', '合同期限形式', 'dropdown'),
        field('contract_start_date', '合同开始日期', 'date'),
        field('contract_end_date', '合同终止日期', 'date'),
        field('probation_start_date', '试用期开始日期', 'date'),
        field('unrelated_field', '不相关字段'),
      ],
    );

    expect(result.map((item) => item.field_code)).toEqual([
      'renewal_reason',
      'contract_term_type',
      'contract_start_date',
      'contract_end_date',
      'probation_start_date',
    ]);
    expect(result.find((item) => item.field_code === 'contract_start_date')).toMatchObject({
      is_required: true,
      default_required: true,
    });
    expect(result.find((item) => item.field_code === 'probation_start_date')?.is_required).toBe(false);
  });

  it('keeps an open-ended renewal end date optional', () => {
    const endDate = field('contract_end_date', '合同终止日期', 'date');

    expect(isRenewalFieldRequired(endDate, { contract_term_type: '无固定期限' })).toBe(false);
    expect(isRenewalFieldRequired(endDate, { contract_term_type: '固定期限' })).toBe(true);
  });

  it('requires probation details only after a probation start date is provided', () => {
    for (const code of ['probation_months', 'probation_end_date', 'probation_salary']) {
      const item = field(code, code);
      expect(isRenewalFieldRequired(item, {})).toBe(false);
      expect(isRenewalFieldRequired(item, { probation_start_date: '2026-08-01' })).toBe(true);
    }
  });

  it('fixes signing method to renewal and writes standard plus legacy aliases', () => {
    const normalized = normalizeInServiceOrderFormValues({
      customerId: 'customer-1',
      departmentId: 'department-1',
      extraData: {
        contract_start_date: '2026-08-01',
        contract_end_date: '2028-07-31',
        contract_subject: '测试主体',
        contract_template: '标准模板',
        contract_term_type: '固定期限',
      },
    }, IN_SERVICE_ORDER_KINDS.CONTRACT_RENEWAL);

    expect(RENEWAL_SIGNING_METHOD).toBe('续签');
    expect(normalized.extraData).toMatchObject({
      contractSigningMethod: 'renewal',
      contract_signing_method: RENEWAL_SIGNING_METHOD,
      contract_start_date: '2026-08-01',
      renewal_start_date: '2026-08-01',
      renewal_end_date: '2028-07-31',
      renewal_contract_subject: '测试主体',
      renewal_contract_template: '标准模板',
      renewal_term_type: '固定期限',
    });
  });

  it('leaves non-renewal payloads untouched', () => {
    const values = {
      customerId: 'customer-1',
      departmentId: 'department-1',
      extraData: { certificateType: 'employment' },
    };
    expect(normalizeInServiceOrderFormValues(
      values,
      IN_SERVICE_ORDER_KINDS.CERTIFICATE,
    )).toBe(values);
  });
});
