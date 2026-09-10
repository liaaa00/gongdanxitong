export interface DetailTemplateFieldEntry {
  fieldCode?: string;
  field_code?: string;
  code?: string;
  sameAs?: string;
  kind?: string;
  value?: string;
  title?: string;
}

export interface DetailTemplateFieldGroup {
  title: string;
  fieldCodes: string[];
}

function readText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text || undefined;
}

export function resolveDetailTemplateFieldCode(entry: DetailTemplateFieldEntry): string | undefined {
  return readText(entry.fieldCode)
    ?? readText(entry.field_code)
    ?? readText(entry.code)
    ?? readText(entry.sameAs);
}

export function getDetailTemplateFieldCodes(fieldList: DetailTemplateFieldEntry[] | null | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  (fieldList ?? []).forEach((entry) => {
    const code = resolveDetailTemplateFieldCode(entry);
    if (!code || seen.has(code)) return;
    seen.add(code);
    result.push(code);
  });
  return result;
}

export function parseDetailTemplateGroups(fieldList: DetailTemplateFieldEntry[] | null | undefined): DetailTemplateFieldGroup[] {
  const groups: DetailTemplateFieldGroup[] = [];
  const assigned = new Set<string>();
  let currentGroup: DetailTemplateFieldGroup | undefined;

  (fieldList ?? []).forEach((entry) => {
    if (entry.kind === 'group') {
      const title = readText(entry.title) ?? readText(entry.value);
      if (!title) {
        currentGroup = undefined;
        return;
      }
      currentGroup = { title, fieldCodes: [] };
      groups.push(currentGroup);
      return;
    }

    const code = resolveDetailTemplateFieldCode(entry);
    if (!code || !currentGroup || assigned.has(code)) return;
    assigned.add(code);
    currentGroup.fieldCodes.push(code);
  });

  return groups;
}

export function buildDetailTemplateFieldList(
  selectedFieldCodes: string[],
  groups: DetailTemplateFieldGroup[],
): DetailTemplateFieldEntry[] {
  const selected = new Set(getDetailTemplateFieldCodes(selectedFieldCodes.map((fieldCode) => ({ fieldCode }))));
  const assigned = new Set<string>();
  const result: DetailTemplateFieldEntry[] = [];
  const seenTitles = new Set<string>();

  groups.forEach((group) => {
    const title = readText(group.title);
    if (!title || seenTitles.has(title)) return;
    seenTitles.add(title);
    result.push({ kind: 'group', value: title });

    group.fieldCodes.forEach((fieldCode) => {
      if (!selected.has(fieldCode) || assigned.has(fieldCode)) return;
      assigned.add(fieldCode);
      result.push({ fieldCode, kind: 'field' });
    });
  });

  selectedFieldCodes.forEach((fieldCode) => {
    if (!selected.has(fieldCode) || assigned.has(fieldCode)) return;
    assigned.add(fieldCode);
    result.push({ fieldCode, kind: 'field' });
  });

  return result;
}

const DEFAULT_DETAIL_FIELD_GROUPS: DetailTemplateFieldGroup[] = [
  {
    title: '基础信息',
    fieldCodes: ['customer_name', 'customer_code', 'outsource_type', 'position', 'position_type', 'employee_name', 'id_card_type', 'id_card_no', 'gender', 'birth_date', 'age', 'household_type', 'ethnicity', 'marital_status', 'mobile', 'email', 'current_address', 'household_address', 'postal_code', 'business_mode', 'employee_type'],
  },
  {
    title: '合同信息',
    fieldCodes: ['contract_term_type', 'contract_term', 'contract_start_date', 'contract_end_date', 'probation_start_date', 'probation_months', 'probation_end_date', 'work_city', 'work_hour_system', 'work_cycle', 'need_company_contract', 'need_esign', 'esign_platform', 'contract_subject', 'contract_template', 'special_contract_template_name', 'need_contract_urge'],
  },
  {
    title: '薪资与发薪',
    fieldCodes: ['salary_form', 'base_salary', 'other_salary', 'probation_salary', 'payroll_cycle', 'payroll_date', 'need_company_payroll', 'payroll_location', 'pay_location'],
  },
  {
    title: '社保公积金',
    fieldCodes: ['social_location', 'social_pay_region', 'start_month', 'social_base', 'fund_start_month', 'fund_base', 'fund_ratio', 'supplementary_fund_ratio', 'social_insurance_feedback', 'social_insurance_result', 'medical_insurance_result', 'housing_fund_result', 'social_insurance_remark'],
  },
  {
    title: '学历信息',
    fieldCodes: ['education', 'graduation_school', 'major', 'graduation_date'],
  },
  {
    title: '银行与备注',
    fieldCodes: ['bank_name', 'bank_account', 'remark', 'special_remark'],
  },
  {
    title: '入职材料收集',
    fieldCodes: ['need_onboarding_contact', 'feedback_deadline', 'is_common_template', 'template_name'],
  },
  {
    title: '离职信息',
    fieldCodes: ['resignation_type', 'resignation_reason', 'last_work_date', 'contract_terminate_date', 'handover_person', 'need_resignation_cert', 'resignation_cert_format', 'cert_delivery_address', 'resignation_cert_tracking_number'],
  },
  {
    title: '办理反馈',
    fieldCodes: ['contract_feedback', 'onboarding_feedback', 'data_entry_feedback', 'resignation_contact_feedback', 'resignation_cert_status', 'social_handover_done', 'final_salary_settled', 'resignation_remark'],
  },
];

const PAYROLL_BANK_CARD_FIELD_GROUPS: DetailTemplateFieldGroup[] = [{
  title: '薪酬银行卡信息',
  fieldCodes: ['employee_name', 'id_card_no', 'need_payroll_slip', 'bank_name', 'bank_account', 'bank_location', 'branch_code', 'payroll_location'],
}];

const SOCIAL_INCREASE_FIELD_GROUPS: DetailTemplateFieldGroup[] = [{
  title: '社保公积金',
  fieldCodes: ['insured_unit', 'social_insurance_remark', 'social_pay_region', 'start_month', 'social_base', 'fund_start_month', 'fund_base', 'fund_ratio', 'supplementary_fund_ratio', 'social_insurance_result', 'medical_insurance_result', 'housing_fund_result'],
}];

const SOCIAL_DECREASE_FIELD_GROUPS: DetailTemplateFieldGroup[] = [
  {
    title: '社保公积金',
    fieldCodes: ['social_insurance_result', 'medical_insurance_result', 'housing_fund_result', 'social_pay_region', 'supplementary_fund_ratio', 'social_insurance_remark'],
  },
  {
    title: '其他字段',
    fieldCodes: ['insured_unit', 'social_insurance_remark', 'social_stop_month', 'fund_stop_month', 'last_work_date'],
  },
];

const RESIGNATION_CONTACT_FIELD_GROUPS: DetailTemplateFieldGroup[] = DEFAULT_DETAIL_FIELD_GROUPS
  .filter((group) => group.title !== '入职材料收集')
  .map((group) => {
    if (group.title === '离职信息') {
      return {
        title: group.title,
        fieldCodes: ['need_resignation_share', ...group.fieldCodes],
      };
    }
    if (group.title === '办理反馈') {
      return { title: '离职材料收集', fieldCodes: ['resignation_contact_feedback'] };
    }
    return group;
  });

export function getDefaultDetailFieldGroups(moduleCode?: string): DetailTemplateFieldGroup[] {
  const groups = moduleCode === 'payroll_bank_card'
    ? PAYROLL_BANK_CARD_FIELD_GROUPS
    : moduleCode === 'social_insurance'
      ? SOCIAL_INCREASE_FIELD_GROUPS
      : moduleCode === 'resignation_social_insurance' || moduleCode === 'social_insurance_resign'
        ? SOCIAL_DECREASE_FIELD_GROUPS
        : moduleCode === 'resignation_contact'
          ? RESIGNATION_CONTACT_FIELD_GROUPS
          : DEFAULT_DETAIL_FIELD_GROUPS;
  return groups.map((group) => ({ title: group.title, fieldCodes: [...group.fieldCodes] }));
}
