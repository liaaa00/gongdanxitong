export enum RoleLevel {
  EXECUTION = 'execution',
  SUPERVISOR = 'supervisor',
  MANAGEMENT = 'management',
  GLOBAL = 'global',
}

export enum FieldType {
  TEXT = 'text',
  NUMBER = 'number',
  DATE = 'date',
  DROPDOWN = 'dropdown',
  EMAIL = 'email',
  PHONE = 'phone',
}

export enum OrderType {
  ONBOARDING = 'onboarding',
  RENEWAL = 'renewal',
  RESIGNATION = 'resignation',
  BENEFIT = 'benefit',
  IN_SERVICE = 'in_service',
  OUT_OF_PROVINCE = 'out_of_province',
  OUT_OF_PROVINCE_INCREASE = 'out_of_province_increase',
  OUT_OF_PROVINCE_DECREASE = 'out_of_province_decrease',
}

export enum BusinessScope {
  BEILUN = 'beilun',
  OUT_OF_PROVINCE = 'out_of_province',
}

export enum ModuleType {
  BUSINESS_MODULE = 'business_module',
  SUB_MODULE = 'sub_module',
  IN_SERVICE = 'in_service',
  OUT_OF_PROVINCE = 'out_of_province',
}

export enum TeamRole {
  PRIMARY = 'primary',
  BACKUP = 'backup',
  IN_SERVICE = 'in_service_team',
  OUT_OF_PROVINCE = 'out_of_province_team',
}

export enum InServiceOrderKind {
  SINGLE_BUSINESS = 'single_business',
  CONTRACT_RENEWAL = 'contract_renewal',
  CERTIFICATE = 'certificate',
  RESIGNATION_CERTIFICATE = 'resignation_certificate',
  OUT_OF_PROVINCE_INCREASE = 'out_of_province_increase',
  OUT_OF_PROVINCE_DECREASE = 'out_of_province_decrease',
}

export enum InServiceOrderStatus {
  DRAFT = 'draft',
  DISPATCHED = 'dispatched',
  ACCEPTED = 'accepted',
  READY = 'ready',
  PROCESSING = 'processing',
  PENDING_INFO = 'pending_info',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  ARCHIVED = 'archived',
}

export enum InServiceHandleChannel {
  ONLINE = 'online',
  OFFLINE = 'offline',
}

export enum BusinessType {
  REGISTRATION = 'registration',
  BENEFIT = 'benefit',
  SUBSIDY = 'subsidy',
  OTHER = 'other',
}

export enum ProcessType {
  ENTERPRISE_ACCOUNT = 'enterprise_account',
  STAFF_CHANGE = 'staff_change',
  SUPPLEMENTARY_PAYMENT = 'supplementary_payment',
  BASE_ADJUSTMENT = 'base_adjustment',
  REFUND = 'refund',
  INFORMATION_CHANGE = 'information_change',
  RETIREMENT_SERVICE = 'retirement_service',
  DISABILITY_ALLOWANCE = 'disability_allowance',
  ONE_TIME_WITHDRAWAL = 'one_time_withdrawal',
  MATERNITY_BENEFIT = 'maternity_benefit',
  WORK_INJURY_RECOGNITION = 'work_injury_recognition',
  WORK_INJURY_REMOTE_FILING = 'work_injury_remote_filing',
  LABOR_CAPACITY_ASSESSMENT = 'labor_capacity_assessment',
  WORK_INJURY_BENEFIT = 'work_injury_benefit',
  UNEMPLOYMENT_BENEFIT = 'unemployment_benefit',
  PERSONAL_SUBSIDY = 'personal_subsidy',
  ENTERPRISE_SUBSIDY = 'enterprise_subsidy',
  PROVIDENT_FUND_TRANSFER = 'provident_fund_transfer',
  PROFESSIONAL_TITLE_RECOGNITION = 'professional_title_recognition',
}

export enum RequirementType {
  UNPAID_SUPPLEMENT = 'unpaid_supplement',
  BASE_DIFFERENCE_SUPPLEMENT = 'base_difference_supplement',
  LATE_REDUCTION_REFUND = 'late_reduction_refund',
  BASE_ADJUSTMENT_REFUND = 'base_adjustment_refund',
  PERSONAL_INFORMATION_CHANGE = 'personal_information_change',
  COMPANY_INFORMATION_CHANGE = 'company_information_change',
}

export const IN_SERVICE_BUSINESS_TYPE_MAPPING: Readonly<Record<BusinessType, readonly ProcessType[]>> = {
  [BusinessType.REGISTRATION]: [
    ProcessType.ENTERPRISE_ACCOUNT,
    ProcessType.STAFF_CHANGE,
    ProcessType.SUPPLEMENTARY_PAYMENT,
    ProcessType.BASE_ADJUSTMENT,
    ProcessType.REFUND,
    ProcessType.INFORMATION_CHANGE,
  ],
  [BusinessType.BENEFIT]: [
    ProcessType.RETIREMENT_SERVICE,
    ProcessType.DISABILITY_ALLOWANCE,
    ProcessType.ONE_TIME_WITHDRAWAL,
    ProcessType.MATERNITY_BENEFIT,
    ProcessType.WORK_INJURY_RECOGNITION,
    ProcessType.WORK_INJURY_REMOTE_FILING,
    ProcessType.LABOR_CAPACITY_ASSESSMENT,
    ProcessType.WORK_INJURY_BENEFIT,
    ProcessType.UNEMPLOYMENT_BENEFIT,
  ],
  [BusinessType.SUBSIDY]: [
    ProcessType.PERSONAL_SUBSIDY,
    ProcessType.ENTERPRISE_SUBSIDY,
  ],
  [BusinessType.OTHER]: [
    ProcessType.PROVIDENT_FUND_TRANSFER,
    ProcessType.PROFESSIONAL_TITLE_RECOGNITION,
  ],
};

export const IN_SERVICE_PROCESS_TYPE_MAPPING: Readonly<Record<ProcessType, readonly RequirementType[]>> = {
  [ProcessType.ENTERPRISE_ACCOUNT]: [],
  [ProcessType.STAFF_CHANGE]: [],
  [ProcessType.SUPPLEMENTARY_PAYMENT]: [
    RequirementType.UNPAID_SUPPLEMENT,
    RequirementType.BASE_DIFFERENCE_SUPPLEMENT,
  ],
  [ProcessType.BASE_ADJUSTMENT]: [],
  [ProcessType.REFUND]: [
    RequirementType.LATE_REDUCTION_REFUND,
    RequirementType.BASE_ADJUSTMENT_REFUND,
  ],
  [ProcessType.INFORMATION_CHANGE]: [
    RequirementType.PERSONAL_INFORMATION_CHANGE,
    RequirementType.COMPANY_INFORMATION_CHANGE,
  ],
  [ProcessType.RETIREMENT_SERVICE]: [],
  [ProcessType.DISABILITY_ALLOWANCE]: [],
  [ProcessType.ONE_TIME_WITHDRAWAL]: [],
  [ProcessType.MATERNITY_BENEFIT]: [],
  [ProcessType.WORK_INJURY_RECOGNITION]: [],
  [ProcessType.WORK_INJURY_REMOTE_FILING]: [],
  [ProcessType.LABOR_CAPACITY_ASSESSMENT]: [],
  [ProcessType.WORK_INJURY_BENEFIT]: [],
  [ProcessType.UNEMPLOYMENT_BENEFIT]: [],
  [ProcessType.PERSONAL_SUBSIDY]: [],
  [ProcessType.ENTERPRISE_SUBSIDY]: [],
  [ProcessType.PROVIDENT_FUND_TRANSFER]: [],
  [ProcessType.PROFESSIONAL_TITLE_RECOGNITION]: [],
};

export enum FieldPermissionMode {
  VISIBLE = 'visible',
  HIDDEN = 'hidden',
  READONLY = 'readonly',
  MASKED = 'masked',
}

export enum DispatchStrategy {
  FIXED = 'fixed',
  ROUND_ROBIN = 'round_robin',
  LOAD_BALANCE = 'load_balance',
  TEAM_CLAIM = 'team_claim',
  POOL = 'pool',
}

export enum WorkOrderStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  RETURNED = 'returned',
  WITHDRAW_PENDING = 'withdraw_pending',
  WITHDRAWN = 'withdrawn',
  VOID_PENDING = 'void_pending',
  VOID = 'void',
}

export const WORK_ORDER_TERMINAL_STATUSES = [
  WorkOrderStatus.COMPLETED,
  WorkOrderStatus.WITHDRAWN,
  WorkOrderStatus.VOID,
] as const;

export enum DispatchedOrderStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  MODIFY_PENDING = 'modify_pending',
  COMPLETED = 'completed',
  RETURNED = 'returned',
  WITHDRAW_PENDING = 'withdraw_pending',
  WITHDRAWN = 'withdrawn',
  VOID_PENDING = 'void_pending',
  VOID = 'void',
}

export enum DispatchModuleCode {
  DATA_ENTRY = 'data_entry',
  SOCIAL_INSURANCE = 'social_insurance',
  ONBOARDING_CONTACT = 'onboarding_contact',
  CONTRACT = 'contract',
  RENEWAL_CONTRACT = 'renewal_contract',
  BENEFIT_APPLY = 'benefit_apply',
  RESIGNATION_CONTACT = 'resignation_contact',
  RESIGNATION_CERT = 'resignation_cert',
  DATA_ENTRY_RESIGN = 'data_entry_resign',
  RESIGNATION_SOCIAL_INSURANCE = 'resignation_social_insurance',
  SINGLE_BUSINESS = 'single_business',
  OUT_OF_PROVINCE_INCREASE = 'out_of_province_increase',
  OUT_OF_PROVINCE_DECREASE = 'out_of_province_decrease',
  IN_SERVICE_SINGLE_BUSINESS = 'in_service_single_business',
  IN_SERVICE_CERTIFICATE = 'in_service_certificate',
  OUT_OF_PROVINCE_DISPATCH = 'out_of_province_dispatch',
}

export const ONBOARDING_DISPATCH_MODULE_CODES: readonly DispatchModuleCode[] = [
  DispatchModuleCode.DATA_ENTRY,
  DispatchModuleCode.SOCIAL_INSURANCE,
  DispatchModuleCode.ONBOARDING_CONTACT,
  DispatchModuleCode.CONTRACT,
];

export const ALL_DISPATCH_MODULE_CODES: readonly DispatchModuleCode[] = [
  DispatchModuleCode.DATA_ENTRY,
  DispatchModuleCode.SOCIAL_INSURANCE,
  DispatchModuleCode.ONBOARDING_CONTACT,
  DispatchModuleCode.CONTRACT,
  DispatchModuleCode.RENEWAL_CONTRACT,
  DispatchModuleCode.BENEFIT_APPLY,
  DispatchModuleCode.RESIGNATION_CONTACT,
  DispatchModuleCode.RESIGNATION_CERT,
  DispatchModuleCode.DATA_ENTRY_RESIGN,
  DispatchModuleCode.RESIGNATION_SOCIAL_INSURANCE,
  DispatchModuleCode.SINGLE_BUSINESS,
  DispatchModuleCode.OUT_OF_PROVINCE_INCREASE,
  DispatchModuleCode.OUT_OF_PROVINCE_DECREASE,
  DispatchModuleCode.IN_SERVICE_SINGLE_BUSINESS,
  DispatchModuleCode.IN_SERVICE_CERTIFICATE,
  DispatchModuleCode.OUT_OF_PROVINCE_DISPATCH,
];

export function isDispatchModuleCode(value: unknown): value is DispatchModuleCode {
  return typeof value === 'string'
    && (ALL_DISPATCH_MODULE_CODES as readonly string[]).includes(value);
}

export enum ImportJobStatus {
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  PARTIAL = 'partial',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}
