import { HttpStatus } from '@nestjs/common';
import { Repository } from 'typeorm';
import { businessException } from 'src/common/exceptions/business-exception';
import {
  DispatchModuleCode,
  DispatchStrategy,
  ExceptionModuleHandler,
  ModuleField,
  ModuleHandler,
  ONBOARDING_DISPATCH_MODULE_CODES,
  OrderType,
  WorkOrder,
  WorkOrderModuleConfig,
  isDispatchModuleCode,
} from 'src/entities';
import { FieldPermissionService } from 'src/modules/field-permissions/field-permission.service';

export type DispatchChild = {
  moduleCode: DispatchModuleCode;
  handlerId: string | null;
  visibleFields: string[];
  dispatchStrategy: DispatchStrategy;
};

export type OnboardingChild = DispatchChild;

export type TxManager = {
  getRepository: <T extends object>(entity: new () => T) => Repository<T>;
};

const MODULE_SORT: Record<string, number> = {
  data_entry: 10,
  onboarding_contact: 20,
  contract: 30,
  social_insurance: 40,
  renewal_contract: 50,
  benefit_apply: 60,
  resignation_contact: 70,
  resignation_cert: 80,
  data_entry_resign: 90,
};

const YES_TOKENS = new Set(['是', 'yes', 'y', 'true', '1', '需要', '需', '生成']);

const ORDER_TYPE_TARGETS: Record<OrderType, DispatchModuleCode[]> = {
  [OrderType.ONBOARDING]: [
    DispatchModuleCode.DATA_ENTRY,
    DispatchModuleCode.SOCIAL_INSURANCE,
  ],
  [OrderType.RENEWAL]: [DispatchModuleCode.RENEWAL_CONTRACT],
  [OrderType.BENEFIT]: [DispatchModuleCode.BENEFIT_APPLY],
  [OrderType.RESIGNATION]: [DispatchModuleCode.RESIGNATION_CONTACT],
};

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
  strategy?: DispatchStrategy,
): Promise<string | null> {
  const normalizedCustomerCode = typeof customerCode === 'string' ? customerCode.trim() : '';
  if (normalizedCustomerCode && ONBOARDING_DISPATCH_MODULE_CODES.includes(moduleCode as DispatchModuleCode)) {
    const exceptionRepo = manager.getRepository(ExceptionModuleHandler);
    const exception = await exceptionRepo.findOne({
      where: { moduleCode: moduleCode as DispatchModuleCode, customerCode: normalizedCustomerCode },
    });
    if (exception) return exception.handlerId;
  }

  const handlerRepo = manager.getRepository(ModuleHandler);
  const handlers = await handlerRepo.find({
    where: { moduleCode, isActive: true },
    order: { isBackup: 'ASC', weight: 'DESC', id: 'ASC' },
  });
  if (handlers.length > 0) {
    return pickModuleHandler(moduleCode, handlers, strategy ?? DispatchStrategy.FIXED);
  }

  // Backward-compatible fallback for older unit tests/mocks and partially migrated deployments.
  const primary = await handlerRepo.findOne({
    where: { moduleCode, isActive: true, isBackup: false },
    order: { weight: 'DESC' },
  });
  if (primary) return primary.handlerId;
  const backup = await handlerRepo.findOne({
    where: { moduleCode, isActive: true },
    order: { isBackup: 'ASC', weight: 'DESC' },
  });
  return backup?.handlerId ?? null;
}

async function resolveModuleStrategy(
  moduleCode: DispatchModuleCode,
  manager: TxManager,
): Promise<DispatchStrategy> {
  try {
    const moduleRepo = manager.getRepository(WorkOrderModuleConfig);
    const moduleConfig = await moduleRepo.findOne({ where: { moduleCode, isActive: true } });
    return moduleConfig?.dispatchStrategy ?? DispatchStrategy.POOL;
  } catch {
    return DispatchStrategy.FIXED;
  }
}

function pickModuleHandler(
  moduleCode: string,
  handlers: ModuleHandler[],
  strategy: DispatchStrategy,
): string | null {
  const active = handlers.filter((handler) => handler.moduleCode === moduleCode && handler.isActive);
  const primary = active.filter((handler) => !handler.isBackup);
  const backup = active.filter((handler) => handler.isBackup);

  if (active.length === 0) return null;

  // 只有一个可用处理人时，按用户要求直接派给该人。
  if (active.length === 1) return active[0].handlerId;

  // 多人且选择“负责人池”时，生成待接单池工单，由有模块权限的人自行接单。
  if (strategy === DispatchStrategy.POOL) return null;

  if (strategy === DispatchStrategy.FIXED) {
    return [...primary, ...backup]
      .sort((left, right) => right.weight - left.weight || left.id.localeCompare(right.id))[0]?.handlerId ?? null;
  }

  if (strategy === DispatchStrategy.LOAD_BALANCE) {
    // 这里没有注入派发表仓库，先按权重选默认人；真正的负载均衡仍保留在独立 DispatchEngine/HandlerPicker 中。
    return [...primary, ...backup]
      .sort((left, right) => right.weight - left.weight || left.id.localeCompare(right.id))[0]?.handlerId ?? null;
  }

  // ROUND_ROBIN 在 helper 内无法安全推进 rr 游标，因此采用稳定顺序兜底，避免随机派发造成不可追踪。
  return [...primary, ...backup]
    .sort((left, right) => left.handlerId.localeCompare(right.handlerId))[0]?.handlerId ?? null;
}

async function resolveVisibleFields(
  moduleCode: string,
  manager: TxManager,
  fieldPermissionService: FieldPermissionService,
): Promise<string[]> {
  try {
    const moduleFieldRepo = manager.getRepository(ModuleField);
    const rows = await moduleFieldRepo.find({
      where: { moduleCode, isActive: true },
      order: { displayOrder: 'ASC' },
    });
    if (rows.length > 0) {
      return rows.map((row) => row.fieldCode);
    }
  } catch {
    // Older tests and deployments without module_fields support should keep using the permission matrix fallback.
  }
  return fieldPermissionService.getVisibleFieldsForScenario(`dispatched:${moduleCode}`);
}

function resolveTargetModules(workOrder: WorkOrder): DispatchModuleCode[] {
  const extra = workOrder.extraData ?? {};
  const targets = [...(ORDER_TYPE_TARGETS[workOrder.orderType] ?? [])];

  if (workOrder.orderType === OrderType.ONBOARDING) {
    if (isYes(extra['need_onboarding_contact'])) targets.push(DispatchModuleCode.ONBOARDING_CONTACT);
    if (isYes(extra['need_company_contract'])) targets.push(DispatchModuleCode.CONTRACT);
  }

  if (workOrder.orderType === OrderType.RESIGNATION) {
    if (isYes(extra['need_resignation_cert'])) targets.push(DispatchModuleCode.RESIGNATION_CERT);
  }

  return Array.from(new Set(targets));
}

export async function buildWorkOrderDispatchChildren(
  workOrder: WorkOrder,
  manager: TxManager,
  fieldPermissionService: FieldPermissionService,
): Promise<DispatchChild[]> {
  const targets = resolveTargetModules(workOrder);
  if (targets.length === 0) return [];

  const customerCode = resolveCustomerCode(workOrder);
  const children: DispatchChild[] = [];
  for (const moduleCode of targets) {
    assertDispatchModuleCode(moduleCode);
    const dispatchStrategy = await resolveModuleStrategy(moduleCode, manager);
    const handlerId = await resolveModuleHandler(moduleCode, manager, customerCode, dispatchStrategy);
    const visibleFields = await resolveVisibleFields(moduleCode, manager, fieldPermissionService);
    children.push({ moduleCode, handlerId, visibleFields, dispatchStrategy });
  }
  children.sort((a, b) => getModuleSortOrder(a.moduleCode) - getModuleSortOrder(b.moduleCode));
  return children;
}

export async function buildOnboardingChildren(
  workOrder: WorkOrder,
  manager: TxManager,
  fieldPermissionService: FieldPermissionService,
): Promise<OnboardingChild[]> {
  if (workOrder.orderType !== OrderType.ONBOARDING) return [];
  return buildWorkOrderDispatchChildren(workOrder, manager, fieldPermissionService);
}
