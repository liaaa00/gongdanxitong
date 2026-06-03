import request from './request';
import { isMockMode, mockDelay } from './mock';

export interface FieldPermissionItem {
  id: string;
  role_id: string;
  role_name?: string;
  field_code: string;
  field_name?: string;
  permission: 'visible' | 'hidden' | 'readonly' | 'masked';
  scenario: string;
}

const FIELD_NAMES: Record<string, string> = {
  customer_name: '客户名称', customer_code: '客户代码', outsource_type: '外包类型', position: '岗位',
  employee_name: '姓名', id_card_no: '身份证号码', gender: '性别',
  birth_date: '出生日期', age: '年龄', household_type: '户籍性质', ethnicity: '民族',
  mobile: '移动电话', email: '电子邮件', current_address: '现住地址', household_address: '户籍地址', postal_code: '邮编',
  contract_term_type: '合同期限形式', contract_term: '合同期限', contract_start_date: '合同开始日期', contract_end_date: '合同终止日期',
  probation_start_date: '试用期开始日期', probation_months: '试用期(月)', probation_end_date: '试用期结束日期',
  work_city: '工作城市', work_hour_system: '工时制', work_cycle: '工作制周期',
  salary_form: '工资形式', base_salary: '基本工资', other_salary: '其他工资', probation_salary: '试用期工资',
  payroll_cycle: '发薪周期', payroll_date: '发薪日期',
  social_location: '参保地', start_month: '起始月', social_base: '社保基数', fund_base: '公积金基数', fund_ratio: '公积金比例',
  bank_name: '开户银行信息', bank_account: '银行借记卡帐号', remark: '备注',
  business_mode: '业务模式', employee_type: '人员类型',
  need_company_contract: '是否企服发起劳动合同', contract_subject: '劳动合同主体', contract_template: '劳动合同模板',
  contract_urge: '劳动合同签署是否需要催办员工', contract_feedback: '劳动合同新签反馈',
  need_onboarding_contact: '入职材料是否需要集约收集', onboarding_feedback: '入职联系反馈',
  need_company_payroll: '是否企服发薪', pay_location: '发薪地',
  special_remark: '特殊备注', data_entry_feedback: '增员报岗录入反馈',
};

const ROLE_NAMES: Record<string, string> = {
  // ★ 8 核心角色体系，业务组通过 group_name 区分
  '1': '系统管理员', '2': '业务负责人',
  '3': '业务组长',   '4': '业务员',
  '5': '数据录入组长', '6': '共享团队负责人',
  '7': '合同专员',   '8': '入离职联系专员',
  '9': '福保负责人',
};

const SENSITIVE_FIELDS = ['id_card_no', 'bank_account', 'base_salary', 'other_salary', 'probation_salary'];
const SOCIAL_FIELDS = ['social_location', 'start_month', 'social_base', 'fund_base', 'fund_ratio'];
const ALL_FIELDS = Object.keys(FIELD_NAMES);
const BASIC_FIELDS = [
  'customer_name', 'customer_code', 'outsource_type', 'position',
  'employee_name', 'gender', 'birth_date', 'age', 'household_type', 'ethnicity',
  'mobile', 'email', 'remark',
];

const CONTRACT_FIELDS = [
  'contract_term_type', 'contract_term', 'contract_start_date', 'contract_end_date',
  'probation_start_date', 'probation_months', 'probation_end_date',
  'need_company_contract', 'contract_subject', 'contract_template',
  'contract_urge', 'contract_feedback',
];

const SALARY_FIELDS = ['base_salary', 'other_salary', 'probation_salary', 'salary_form', 'payroll_cycle', 'payroll_date'];
const BANK_FIELDS = ['bank_name', 'bank_account', 'pay_location'];
const ADDRESS_FIELDS = ['current_address', 'household_address', 'postal_code', 'work_city'];

let _permId = 1000;
function p(roleId: string, fieldCode: string, perm: string, scenario: string): FieldPermissionItem {
  return {
    id: String(_permId++),
    role_id: roleId,
    role_name: ROLE_NAMES[roleId] || '',
    field_code: fieldCode,
    field_name: FIELD_NAMES[fieldCode] || fieldCode,
    permission: perm as FieldPermissionItem['permission'],
    scenario,
  };
}

function buildMainPerms(): FieldPermissionItem[] {
  const result: FieldPermissionItem[] = [];

  for (const f of ALL_FIELDS) {
    result.push(p('1', f, 'visible', 'main'));
    result.push(p('2', f, 'visible', 'main'));
  }

  for (const rid of ['3', '4', '5', '6', '7', '8', '9', '10', '11', '12']) {
    for (const f of ALL_FIELDS) {
      if (f === 'id_card_no') {
        result.push(p(rid, f, 'masked', 'main'));
      } else if (f === 'bank_account') {
        result.push(p(rid, f, 'readonly', 'main'));
      } else {
        result.push(p(rid, f, 'visible', 'main'));
      }
    }
  }

  for (const rid of ['13', '14', '15']) {
    for (const f of ALL_FIELDS) {
      if (BASIC_FIELDS.includes(f)) {
        result.push(p(rid, f, 'visible', 'main'));
      } else {
        result.push(p(rid, f, 'hidden', 'main'));
      }
    }
  }

  return result;
}

function buildDispatchPerms(moduleCode: string, teamRoleIds: string[], visibleFields: string[], editableFields: string[], scenario: string): FieldPermissionItem[] {
  const result: FieldPermissionItem[] = [];
  const allTeamFields = new Set(visibleFields);
  const allRoleIds = Object.keys(ROLE_NAMES);
  const teamSet = new Set(teamRoleIds);

  for (const rid of allRoleIds) {
    for (const f of ALL_FIELDS) {
      if (rid === '1' || rid === '2') {
        result.push(p(rid, f, 'visible', scenario));
      } else if (teamSet.has(rid)) {
        if (allTeamFields.has(f)) {
          result.push(p(rid, f, editableFields.includes(f) ? 'visible' : 'readonly', scenario));
        } else if (f === 'id_card_no') {
          result.push(p(rid, f, 'masked', scenario));
        } else if (BASIC_FIELDS.includes(f)) {
          result.push(p(rid, f, 'visible', scenario));
        } else {
          result.push(p(rid, f, 'hidden', scenario));
        }
      } else if (rid === '3') {
        if (BASIC_FIELDS.includes(f) || f === 'id_card_no') {
          result.push(p(rid, f, f === 'id_card_no' ? 'masked' : 'readonly', scenario));
        } else {
          result.push(p(rid, f, 'hidden', scenario));
        }
      } else {
        if (BASIC_FIELDS.includes(f)) {
          result.push(p(rid, f, 'readonly', scenario));
        } else {
          result.push(p(rid, f, 'hidden', scenario));
        }
      }
    }
  }

  return result;
}

function buildMockPermissions(): FieldPermissionItem[] {
  const result: FieldPermissionItem[] = [];

  result.push(...buildMainPerms());

  const allExceptSocial = ALL_FIELDS.filter((f) => !SOCIAL_FIELDS.includes(f));
  result.push(...buildDispatchPerms(
    'data_entry', ['13'],
    allExceptSocial,
    ['data_entry_feedback', 'bank_name', 'bank_account'],
    'dispatched:data_entry',
  ));

  const contractVisible = [...BASIC_FIELDS, ...CONTRACT_FIELDS, ...ADDRESS_FIELDS, 'mobile', 'email', 'id_card_no',
    'work_hour_system', 'work_cycle', 'need_company_payroll', 'business_mode', 'employee_type',
    'remark', 'special_remark'];
  result.push(...buildDispatchPerms(
    'contract', ['14'],
    contractVisible,
    ['contract_feedback', 'special_remark'],
    'dispatched:contract',
  ));

  const contactVisible = [...BASIC_FIELDS, ...BANK_FIELDS, ...ADDRESS_FIELDS,
    'need_onboarding_contact', 'onboarding_feedback', 'special_remark',
    'mobile', 'email', 'id_card_no', 'remark'];
  result.push(...buildDispatchPerms(
    'onboarding_contact', ['15'],
    contactVisible,
    ['onboarding_feedback', 'bank_name', 'bank_account'],
    'dispatched:onboarding_contact',
  ));

  result.push(...buildDispatchPerms(
    'renewal_contract', ['14'],
    [...BASIC_FIELDS, ...CONTRACT_FIELDS],
    ['contract_feedback'],
    'dispatched:renewal_contract',
  ));

  result.push(...buildDispatchPerms(
    'resignation_contact', ['15'],
    [...BASIC_FIELDS, 'mobile', 'email', 'remark'],
    ['onboarding_feedback'],
    'dispatched:resignation_contact',
  ));

  result.push(...buildDispatchPerms(
    'resignation_cert', ['14'],
    [...BASIC_FIELDS, 'mobile', 'email'],
    [],
    'dispatched:resignation_cert',
  ));

  result.push(...buildDispatchPerms(
    'benefit_apply', ['13'],
    [...BASIC_FIELDS, 'mobile', 'email', 'remark'],
    ['data_entry_feedback'],
    'dispatched:benefit_apply',
  ));

  return result;
}

const mockPermissions: FieldPermissionItem[] = buildMockPermissions();

export async function getFieldPermissions(params?: { role_id?: string; scenario?: string }): Promise<FieldPermissionItem[]> {
  if (isMockMode) {
    let filtered = mockPermissions;
    if (params?.role_id) filtered = filtered.filter((p) => p.role_id === params.role_id);
    if (params?.scenario) filtered = filtered.filter((p) => p.scenario === params.scenario);
    return mockDelay(filtered);
  }
  try {
    return await request.get('/admin/field-permissions', { params, silentError: true } as any) as FieldPermissionItem[];
  } catch {
    return [];
  }
}

export async function batchUpdatePermissions(data: FieldPermissionItem[]): Promise<void> {
  if (isMockMode) return mockDelay(undefined);
  return request.put('/admin/field-permissions/batch', data) as Promise<void>;
}
