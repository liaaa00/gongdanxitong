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
}

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
  COMPLETED = 'completed',
  RETURNED = 'returned',
}

export enum DispatchModuleCode {
  DATA_ENTRY = 'data_entry',
  SOCIAL_INSURANCE = 'social_insurance',
  ONBOARDING_CONTACT = 'onboarding_contact',
  CONTRACT = 'contract',
}

export const ONBOARDING_DISPATCH_MODULE_CODES: readonly DispatchModuleCode[] = [
  DispatchModuleCode.DATA_ENTRY,
  DispatchModuleCode.SOCIAL_INSURANCE,
  DispatchModuleCode.ONBOARDING_CONTACT,
  DispatchModuleCode.CONTRACT,
];

export function isDispatchModuleCode(value: unknown): value is DispatchModuleCode {
  return typeof value === 'string'
    && (ONBOARDING_DISPATCH_MODULE_CODES as readonly string[]).includes(value);
}

export enum ImportJobStatus {
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  PARTIAL = 'partial',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}
