import { HttpStatus } from '@nestjs/common';
import { Repository } from 'typeorm';
import { businessException } from 'src/common/exceptions/business-exception';
import {
  BusinessScope,
  DispatchModuleCode,
  ExceptionModuleHandler,
  ModuleField,
  ModuleHandler,
  ONBOARDING_DISPATCH_MODULE_CODES,
  OrderType,
  WorkOrder,
  isDispatchModuleCode,
} from 'src/entities';
import { FieldPermissionService } from 'src/modules/field-permissions/field-permission.service';
import {
  getMissingPayrollBankCardFields,
  PAYROLL_BANK_CARD_VISIBLE_FIELDS,
} from 'src/modules/dispatched-orders/payroll-bank-card';

export type OnboardingChild = {
  moduleCode: DispatchModuleCode;
  handlerId: string | null;
  visibleFields: string[];
  dueAt?: Date | null;
  slaHours?: number | null;
  slaReminderBeforeHours?: number | null;
};

export type TxManager = {
  getRepository: <T extends object>(entity: new () => T) => Repository<T>;
};

const MODULE_SORT: Record<string, number> = {
  data_entry: 10,
  onboarding_contact: 20,
  payroll_bank_card: 25,
  contract: 30,
  social_insurance: 40,
};

const YES_TOKENS = new Set(['是', 'yes', 'y', 'true', '1', '需要', '需', '生成']);

export function isYes(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  return YES_TOKENS.has(String(value ?? '').trim().toLowerCase());
}

export function getModuleSortOrder(moduleCode: string): number {
  return MODULE_SORT[moduleCode] ?? 100;
}

export function assertDispatchModuleCode(value: string): asserts value is DispatchModuleCode {
  if (!isDispatchModuleCode(value)) {
    throw businessException(4203, HttpStatus.INTERNAL_SERVER_ERROR, `非法 module_code: ${value}`);
  }
}

export function resolveCustomerCode(workOrder: WorkOrder): string | null {
  const extra = workOrder.extraData ?? {};
  const candidates = [
    workOrder.customerCode,
    extra['customer_code'],
    extra['customerCode'],
    extra['client_code'],
    extra['clientCode'],
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const normalized = candidate.trim();
      if (normalized) return normalized;
    }
  }
  return null;
}

export async function resolveModuleHandler(
  moduleCode: string,
  manager: TxManager,
  customerCode?: string | null,
  businessScope: BusinessScope = BusinessScope.BEILUN,
): Promise<string | null> {
  const normalizedCustomerCode = typeof customerCode === 'string' ? customerCode.trim() : '';
  if (normalizedCustomerCode) {
    const exceptionRepo = manager.getRepository(ExceptionModuleHandler);
    const exception = await exceptionRepo.findOne({
      where: { moduleCode: moduleCode as DispatchModuleCode, customerCode: normalizedCustomerCode, businessScope },
    });
    if (exception) return exception.handlerId;
  }

  const handlerRepo = manager.getRepository(ModuleHandler);
  const primary = await handlerRepo.findOne({
    where: { moduleCode, businessScope, isActive: true, isBackup: false },
    order: { weight: 'DESC' },
  });
  if (primary) return primary.handlerId;
  const backup = await handlerRepo.findOne({
    where: { moduleCode, businessScope, isActive: true },
    order: { isBackup: 'ASC', weight: 'DESC' },
  });
  return backup?.handlerId ?? null;
}

async function resolveVisibleFields(
  moduleCode: string,
  manager: TxManager,
  fieldPermissionService: FieldPermissionService,
  businessScope: BusinessScope,
): Promise<string[]> {
  try {
    const moduleFieldRepo = manager.getRepository(ModuleField);
    const rows = await moduleFieldRepo.find({
      where: { moduleCode, businessScope, isActive: true },
      order: { displayOrder: 'ASC' },
    });
    if (rows.length > 0) {
      return rows.map((row) => row.fieldCode);
    }
  } catch {
    // Older tests and deployments without module_fields support should keep using the permission matrix fallback.
  }
  return fieldPermissionService.getVisibleFieldsForScenario(`dispatched:${moduleCode}`, businessScope);
}

export async function buildOnboardingChildren(
  workOrder: WorkOrder,
  manager: TxManager,
  fieldPermissionService: FieldPermissionService,
): Promise<OnboardingChild[]> {
  if (workOrder.orderType !== OrderType.ONBOARDING) return [];

  const extra = workOrder.extraData ?? {};
  const customerCode = resolveCustomerCode(workOrder);
  const targets: DispatchModuleCode[] = [
    DispatchModuleCode.DATA_ENTRY,
    DispatchModuleCode.SOCIAL_INSURANCE,
  ];
  const needsPayrollBankCard = isYes(extra['need_payroll_slip']);
  const missingPayrollFields = needsPayrollBankCard ? getMissingPayrollBankCardFields(extra) : [];
  const needsOnboardingContact = isYes(extra['need_onboarding_contact']);
  if (needsOnboardingContact || missingPayrollFields.length > 0) targets.push(DispatchModuleCode.ONBOARDING_CONTACT);
  if (needsPayrollBankCard) targets.push(DispatchModuleCode.PAYROLL_BANK_CARD);
  if (isYes(extra['need_company_contract'])) targets.push(DispatchModuleCode.CONTRACT);

  const children: OnboardingChild[] = [];
  for (const moduleCode of targets) {
    if (!ONBOARDING_DISPATCH_MODULE_CODES.includes(moduleCode)) {
      throw businessException(4203, HttpStatus.INTERNAL_SERVER_ERROR, `非法 module_code: ${moduleCode}`);
    }
    const handlerId = await resolveModuleHandler(moduleCode, manager, customerCode, workOrder.businessScope);
    let visibleFields = await resolveVisibleFields(moduleCode, manager, fieldPermissionService, workOrder.businessScope);
    if (moduleCode === DispatchModuleCode.ONBOARDING_CONTACT && missingPayrollFields.length > 0) {
      visibleFields = needsOnboardingContact
        ? Array.from(new Set([...visibleFields, ...missingPayrollFields]))
        : PAYROLL_BANK_CARD_VISIBLE_FIELDS.filter((fieldCode) => (
          missingPayrollFields.includes(fieldCode as (typeof missingPayrollFields)[number])
          || ['employee_name', 'id_card_no'].includes(fieldCode)
        ));
    }
    children.push({ moduleCode, handlerId, visibleFields });
  }
  children.sort((a, b) => getModuleSortOrder(a.moduleCode) - getModuleSortOrder(b.moduleCode));
  return children;
}
