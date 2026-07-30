export const IN_SERVICE_ORDER_KINDS = {
  SINGLE_BUSINESS: 'single_business',
  CONTRACT_RENEWAL: 'contract_renewal',
  CERTIFICATE: 'certificate',
  RESIGNATION_CERTIFICATE: 'resignation_certificate',
  OUT_OF_PROVINCE_INCREASE: 'out_of_province_increase',
  OUT_OF_PROVINCE_DECREASE: 'out_of_province_decrease',
} as const;

export type InServiceOrderKind = typeof IN_SERVICE_ORDER_KINDS[keyof typeof IN_SERVICE_ORDER_KINDS];

export const IN_SERVICE_ORDER_KIND_META: Record<InServiceOrderKind, {
  label: string;
  listTitle: string;
  createTitle: string;
}> = {
  single_business: { label: '单项业务', listTitle: '单项业务办理', createTitle: '新建单项业务' },
  contract_renewal: { label: '劳动合同续签', listTitle: '劳动合同续签', createTitle: '发起劳动合同续签' },
  certificate: { label: '证明开具', listTitle: '证明开具', createTitle: '发起证明开具' },
  resignation_certificate: { label: '离职证明', listTitle: '离职证明', createTitle: '发起离职证明' },
  out_of_province_increase: { label: '省外增员', listTitle: '省外增员', createTitle: '新建省外增员' },
  out_of_province_decrease: { label: '省外减员', listTitle: '省外减员', createTitle: '新建省外减员' },
};

export const PROVINCES_27 = [
  '广东', '安徽', '黑龙江', '重庆', '湖北', '江西', '云南', '吉林', '江苏',
  '山西', '山东', '北京', '陕西', '辽宁', '天津', '福建', '上海', '湖南',
  '河南', '河北', '贵州', '四川', '广西', '甘肃', '新疆', '宁夏', '海南',
] as const;

export const IN_SERVICE_PROVINCES = ['浙江', ...PROVINCES_27] as const;

export type InServiceProvince = typeof IN_SERVICE_PROVINCES[number];

export const IN_SERVICE_BUSINESS_TYPES = {
  REGISTRATION: 'registration',
  BENEFIT: 'benefit',
  SUBSIDY: 'subsidy',
  OTHER: 'other',
} as const;

export const IN_SERVICE_PROCESS_TYPES = {
  ENTERPRISE_ACCOUNT: 'enterprise_account',
  STAFF_CHANGE: 'staff_change',
  SUPPLEMENTARY_PAYMENT: 'supplementary_payment',
  BASE_ADJUSTMENT: 'base_adjustment',
  REFUND: 'refund',
  INFORMATION_CHANGE: 'information_change',
  RETIREMENT_SERVICE: 'retirement_service',
  DISABILITY_ALLOWANCE: 'disability_allowance',
  ONE_TIME_WITHDRAWAL: 'one_time_withdrawal',
  MATERNITY_BENEFIT: 'maternity_benefit',
  WORK_INJURY_RECOGNITION: 'work_injury_recognition',
  WORK_INJURY_REMOTE_FILING: 'work_injury_remote_filing',
  LABOR_CAPACITY_ASSESSMENT: 'labor_capacity_assessment',
  WORK_INJURY_BENEFIT: 'work_injury_benefit',
  UNEMPLOYMENT_BENEFIT: 'unemployment_benefit',
  PERSONAL_SUBSIDY: 'personal_subsidy',
  ENTERPRISE_SUBSIDY: 'enterprise_subsidy',
  PROVIDENT_FUND_TRANSFER: 'provident_fund_transfer',
  PROFESSIONAL_TITLE_RECOGNITION: 'professional_title_recognition',
} as const;

export const IN_SERVICE_REQUIREMENT_TYPES = {
  UNPAID_SUPPLEMENT: 'unpaid_supplement',
  BASE_DIFFERENCE_SUPPLEMENT: 'base_difference_supplement',
  LATE_REDUCTION_REFUND: 'late_reduction_refund',
  BASE_ADJUSTMENT_REFUND: 'base_adjustment_refund',
  PERSONAL_INFORMATION_CHANGE: 'personal_information_change',
  COMPANY_INFORMATION_CHANGE: 'company_information_change',
} as const;

export type InServiceBusinessType = typeof IN_SERVICE_BUSINESS_TYPES[keyof typeof IN_SERVICE_BUSINESS_TYPES];
export type InServiceProcessType = typeof IN_SERVICE_PROCESS_TYPES[keyof typeof IN_SERVICE_PROCESS_TYPES];
export type InServiceRequirementType = typeof IN_SERVICE_REQUIREMENT_TYPES[keyof typeof IN_SERVICE_REQUIREMENT_TYPES];

export const IN_SERVICE_BUSINESS_TYPE_LABELS: Record<InServiceBusinessType, string> = {
  registration: '参保登记类',
  benefit: '待遇类',
  subsidy: '补贴类',
  other: '其他',
};

export const IN_SERVICE_PROCESS_TYPE_LABELS: Record<InServiceProcessType, string> = {
  enterprise_account: '企业开户',
  staff_change: '增减员',
  supplementary_payment: '补缴',
  base_adjustment: '调基',
  refund: '退费',
  information_change: '信息变更',
  retirement_service: '退休代办',
  disability_allowance: '病残津贴申请',
  one_time_withdrawal: '一次性支取',
  maternity_benefit: '生育待遇申请',
  work_injury_recognition: '工伤认定',
  work_injury_remote_filing: '工伤异地备案',
  labor_capacity_assessment: '劳动能力鉴定',
  work_injury_benefit: '工伤待遇申请',
  unemployment_benefit: '失业金申领',
  personal_subsidy: '个人补贴',
  enterprise_subsidy: '企业补贴',
  provident_fund_transfer: '公积金转移',
  professional_title_recognition: '职称认定',
};

export const IN_SERVICE_REQUIREMENT_TYPE_LABELS: Record<InServiceRequirementType, string> = {
  unpaid_supplement: '应缴未缴补缴',
  base_difference_supplement: '基数调整差额补缴',
  late_reduction_refund: '迟办减少退费',
  base_adjustment_refund: '基数调整退费',
  personal_information_change: '个人信息变更',
  company_information_change: '单位信息变更',
};

export const IN_SERVICE_BUSINESS_TYPE_MAPPING: Record<InServiceBusinessType, readonly InServiceProcessType[]> = {
  registration: [
    'enterprise_account', 'staff_change', 'supplementary_payment',
    'base_adjustment', 'refund', 'information_change',
  ],
  benefit: [
    'retirement_service', 'disability_allowance', 'one_time_withdrawal',
    'maternity_benefit', 'work_injury_recognition', 'work_injury_remote_filing',
    'labor_capacity_assessment', 'work_injury_benefit', 'unemployment_benefit',
  ],
  subsidy: ['personal_subsidy', 'enterprise_subsidy'],
  other: ['provident_fund_transfer', 'professional_title_recognition'],
};

export const IN_SERVICE_PROCESS_TYPE_MAPPING: Record<InServiceProcessType, readonly InServiceRequirementType[]> = {
  enterprise_account: [],
  staff_change: [],
  supplementary_payment: ['unpaid_supplement', 'base_difference_supplement'],
  base_adjustment: [],
  refund: ['late_reduction_refund', 'base_adjustment_refund'],
  information_change: ['personal_information_change', 'company_information_change'],
  retirement_service: [],
  disability_allowance: [],
  one_time_withdrawal: [],
  maternity_benefit: [],
  work_injury_recognition: [],
  work_injury_remote_filing: [],
  labor_capacity_assessment: [],
  work_injury_benefit: [],
  unemployment_benefit: [],
  personal_subsidy: [],
  enterprise_subsidy: [],
  provident_fund_transfer: [],
  professional_title_recognition: [],
};

export const IN_SERVICE_STATUSES = [
  'draft',
  'dispatched',
  'accepted',
  'ready',
  'processing',
  'pending_info',
  'completed',
  'failed',
  'cancelled',
  'archived',
] as const;

export type InServiceOrderStatus = typeof IN_SERVICE_STATUSES[number];

export const IN_SERVICE_STATUS_META: Record<InServiceOrderStatus, { label: string; color: string }> = {
  draft: { label: '历史草稿', color: 'default' },
  dispatched: { label: '待受理', color: 'processing' },
  accepted: { label: '已受理，待材料初审', color: 'blue' },
  ready: { label: '已受理，完成材料初审', color: 'cyan' },
  processing: { label: '办理中', color: 'geekblue' },
  pending_info: { label: '待补充材料', color: 'warning' },
  completed: { label: '办理成功', color: 'success' },
  failed: { label: '办理失败', color: 'error' },
  cancelled: { label: '订单取消', color: 'default' },
  archived: { label: '历史归档', color: 'default' },
};

export const IN_SERVICE_HANDLE_CHANNEL_META = {
  online: { label: '线上办理', color: 'blue' },
  offline: { label: '线下办理', color: 'green' },
} as const;

export type InServiceHandleChannel = keyof typeof IN_SERVICE_HANDLE_CHANNEL_META;

export const IN_SERVICE_BUSINESS_TYPE_OPTIONS = Object.entries(IN_SERVICE_BUSINESS_TYPE_LABELS)
  .map(([value, label]) => ({ value, label }));

export function getInServiceProcessOptions(businessType?: InServiceBusinessType) {
  if (!businessType) return [];
  return IN_SERVICE_BUSINESS_TYPE_MAPPING[businessType]
    .map((value) => ({ value, label: IN_SERVICE_PROCESS_TYPE_LABELS[value] }));
}

export function getInServiceRequirementOptions(processType?: InServiceProcessType) {
  if (!processType) return [];
  return IN_SERVICE_PROCESS_TYPE_MAPPING[processType]
    .map((value) => ({ value, label: IN_SERVICE_REQUIREMENT_TYPE_LABELS[value] }));
}

export function getInServiceCategoryPath(
  businessType?: string | null,
  processType?: string | null,
  requirementType?: string | null,
): string {
  return [
    IN_SERVICE_BUSINESS_TYPE_LABELS[businessType as InServiceBusinessType] || businessType,
    IN_SERVICE_PROCESS_TYPE_LABELS[processType as InServiceProcessType] || processType,
    requirementType
      ? IN_SERVICE_REQUIREMENT_TYPE_LABELS[requirementType as InServiceRequirementType] || requirementType
      : undefined,
  ].filter(Boolean).join(' / ');
}
