import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  DispatchModuleCode,
  DispatchRule,
  DispatchStrategy,
  ModuleHandler,
  ModuleType,
  DispatchedOrder,
  DispatchedOrderStatus,
  OrderType,
  TeamRole,
  WorkOrder,
  WorkOrderModuleConfig,
} from 'src/entities';
import { FieldPermissionService } from 'src/modules/field-permissions/field-permission.service';
import { AstEvaluator } from './ast-evaluator';
import {
  AstNode,
  ChildToCreate,
  DispatchEvaluationResult,
  ProvinceDispatchContext,
  RuleHit,
} from './dispatch-engine.types';
import { HandlerPickerService } from './handler-picker.service';

@Injectable()
export class DispatchEngineService {
  constructor(
    @InjectRepository(DispatchRule)
    private readonly dispatchRuleRepository: Repository<DispatchRule>,
    @InjectRepository(WorkOrderModuleConfig)
    private readonly moduleConfigRepository: Repository<WorkOrderModuleConfig>,
    @InjectRepository(ModuleHandler)
    private readonly moduleHandlerRepository: Repository<ModuleHandler>,
    private readonly astEvaluator: AstEvaluator,
    private readonly handlerPicker: HandlerPickerService,
    private readonly fieldPermissionService: FieldPermissionService,
  ) {}

  async evaluate(workOrder: WorkOrder, manager?: EntityManager): Promise<DispatchedOrder[]> {
    const result = await this.evaluateDetailed(workOrder, manager);
    return result.childrenToCreate.map((child) => this.toDispatchedOrder(workOrder, child));
  }

  async evaluateDetailed(workOrder: WorkOrder, manager?: EntityManager): Promise<DispatchEvaluationResult> {
    workOrder.extraData = this.normalizeOnboardingDispatchFlags(workOrder.extraData ?? {});
    const dispatchRuleRepository = manager?.getRepository(DispatchRule) ?? this.dispatchRuleRepository;
    const rules = await dispatchRuleRepository.find({
      where: { orderType: workOrder.orderType as OrderType, isActive: true },
      order: { priority: 'ASC', createdAt: 'ASC' },
    });

    const hits: RuleHit[] = [];
    const moduleWinner = new Map<string, { hit: RuleHit; rule: DispatchRule; rank: number }>();
    const visibleFieldsByModule = new Map<string, string[]>();

    for (const rule of rules) {
      const evaluated = await this.astEvaluator.evaluate(
        this.toAstNode(rule.triggerConditions),
        workOrder.extraData,
      );

      if (!evaluated.result || !this.ruleScopeMatches(rule, workOrder)) {
        continue;
      }

      const moduleCode = rule.subModule ?? rule.targetModule;
      const rank = this.ruleScopeRank(rule);
      const hit: RuleHit = {
        ruleId: rule.id,
        ruleName: rule.ruleName,
        targetModule: moduleCode,
        priority: rule.priority,
        trace: evaluated.trace,
        deduped: false,
      };
      hits.push(hit);

      const currentWinner = moduleWinner.get(moduleCode);
      if (!currentWinner) {
        moduleWinner.set(moduleCode, { hit, rule, rank });
        continue;
      }

      if (rank > currentWinner.rank || (rank === currentWinner.rank && rule.priority < currentWinner.hit.priority)) {
        currentWinner.hit.deduped = true;
        moduleWinner.set(moduleCode, { hit, rule, rank });
      } else {
        hit.deduped = true;
      }
    }

    const childrenToCreate: ChildToCreate[] = [];
    for (const [moduleCode, winner] of moduleWinner.entries()) {
      const rule = winner.rule;

      const province = this.extractTriggerValue(rule.triggerConditions, 'province')
        ?? this.readProvince(workOrder.extraData ?? {})
        ?? '';
      const provinceDispatchContext = this.resolveProvinceDispatchContext(
        moduleCode,
        workOrder.orderType,
        province,
      );
      const handlerId = await this.resolveModuleTeamHandler(
        moduleCode,
        rule.dispatchStrategy,
        manager,
        provinceDispatchContext,
      );
      const visibleFields = await this.fieldPermissionService.getVisibleFieldsForScenario(
        `dispatched:${moduleCode}`,
      );
      visibleFieldsByModule.set(moduleCode, visibleFields);
      childrenToCreate.push({
        moduleCode,
        handlerId,
        visibleFields,
        ruleId: rule.id,
        ruleName: rule.ruleName,
        dispatchStrategy: rule.dispatchStrategy,
        provinceDispatchContext,
      });
    }

    if (workOrder.orderType === OrderType.ONBOARDING) {
      await this.ensureOnboardingSplitChildren(workOrder, childrenToCreate, manager);
    }

    await this.applyModuleConfig(childrenToCreate, workOrder.extraData ?? {}, manager);

    childrenToCreate.sort((left, right) => {
      const leftRule = rules.find((item) => item.id === left.ruleId);
      const rightRule = rules.find((item) => item.id === right.ruleId);
      return (leftRule?.priority ?? 0) - (rightRule?.priority ?? 0);
    });

    return {
      hits,
      childrenToCreate,
    };
  }

  private async applyModuleConfig(childrenToCreate: ChildToCreate[], extraData: Record<string, unknown>, manager?: EntityManager): Promise<void> {
    const moduleCodes = Array.from(new Set(childrenToCreate.map((child) => child.moduleCode).filter(Boolean)));
    if (moduleCodes.length === 0) return;

    const moduleConfigRepository = manager?.getRepository(WorkOrderModuleConfig) ?? this.moduleConfigRepository;
    const configs = await moduleConfigRepository.find({ where: moduleCodes.map((moduleCode) => ({ moduleCode })) });
    const configByModule = new Map(configs.map((config) => [config.moduleCode, config]));
    const base = new Date();

    for (const child of childrenToCreate) {
      const config = configByModule.get(child.moduleCode);
      const slaHours = config?.slaHours ?? null;
      const reminderBeforeHours = config?.slaReminderBeforeHours ?? null;
      child.slaHours = slaHours;
      child.slaReminderBeforeHours = reminderBeforeHours;
      child.handlerId = await this.resolveModuleTeamHandler(
        child.moduleCode,
        config?.dispatchStrategy ?? DispatchStrategy.TEAM_CLAIM,
        manager,
        child.provinceDispatchContext,
      );
      child.dispatchStrategy = config?.dispatchStrategy ?? DispatchStrategy.TEAM_CLAIM;

      if (child.moduleCode === 'contract' && extraData.contract_start_date) {
        const startDate = new Date(extraData.contract_start_date as string);
        if (!isNaN(startDate.getTime())) {
          child.dueAt = new Date(startDate.getTime() + 26 * 24 * 60 * 60 * 1000);
          continue;
        }
      }

      if (slaHours !== null && Number.isFinite(Number(slaHours)) && Number(slaHours) > 0) {
        child.dueAt = new Date(base.getTime() + Number(slaHours) * 60 * 60 * 1000);
      } else {
        child.dueAt = null;
      }
    }
  }

  private ruleScopeMatches(rule: DispatchRule, workOrder: WorkOrder): boolean {
    if (rule.customerId && rule.customerId !== workOrder.customerId) {
      return false;
    }
    if (rule.departmentId && rule.departmentId !== workOrder.departmentId) {
      return false;
    }
    return true;
  }

  private ruleScopeRank(rule: DispatchRule): number {
    if (rule.customerId) return 3;
    if (rule.departmentId) return 2;
    return 1;
  }

  private async resolveModuleTeamHandler(
    moduleCode: string,
    strategy: DispatchStrategy,
    manager?: EntityManager,
    context?: ProvinceDispatchContext,
  ): Promise<string | null> {
    if (context) {
      return this.handlerPicker.pick(strategy, moduleCode, manager, {
        province: context.province,
        mappingSource: context.mappingSource,
      });
    }

    const repository = manager?.getRepository(ModuleHandler) ?? this.moduleHandlerRepository;
    const activeHandlers = (await repository.find({
      where: { moduleCode, isActive: true, isBackup: false },
      relations: { handler: true },
      order: { weight: 'DESC', handlerId: 'ASC' },
    })).filter((candidate) => candidate.handler?.isActive !== false);
    if (activeHandlers.length === 0) return null;
    if (activeHandlers.length === 1) return activeHandlers[0].handlerId;
    return this.handlerPicker.pick(strategy, moduleCode, manager);
  }

  private resolveProvinceDispatchContext(
    moduleCode: string,
    orderType: OrderType,
    province: string,
  ): ProvinceDispatchContext | undefined {
    if (moduleCode === DispatchModuleCode.IN_SERVICE_SINGLE_BUSINESS && orderType === OrderType.IN_SERVICE) {
      return {
        moduleType: ModuleType.IN_SERVICE,
        province,
        mappingSource: 'sheet4',
        teamRole: TeamRole.IN_SERVICE,
      };
    }
    if (
      moduleCode === DispatchModuleCode.OUT_OF_PROVINCE_DISPATCH
      && [OrderType.OUT_OF_PROVINCE_INCREASE, OrderType.OUT_OF_PROVINCE_DECREASE].includes(orderType)
    ) {
      return {
        moduleType: ModuleType.OUT_OF_PROVINCE,
        province,
        mappingSource: 'sheet5',
        teamRole: TeamRole.OUT_OF_PROVINCE,
      };
    }
    return undefined;
  }

  private readProvince(extraData: Record<string, unknown>): string | null {
    const value = extraData.province ?? extraData.provinceName ?? extraData['省份'];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private extractTriggerValue(conditions: Record<string, unknown> | null, field: string): string | null {
    if (!conditions) return null;

    const visit = (node: unknown): string | null => {
      if (!node || typeof node !== 'object') return null;
      const object = node as Record<string, unknown>;
      if (object.field === field && object.op === 'EQ' && typeof object.value === 'string') {
        return object.value;
      }
      for (const key of ['children', 'and', 'or']) {
        const nested = object[key];
        if (!Array.isArray(nested)) continue;
        for (const child of nested) {
          const found = visit(child);
          if (found !== null) return found;
        }
      }
      const direct = object[field];
      return typeof direct === 'string' ? direct : null;
    };

    return visit(conditions);
  }

  private normalizeOnboardingDispatchFlags(extraData: Record<string, unknown>): Record<string, unknown> {
    const normalized = { ...extraData };
    const aliases: Record<string, string[]> = {
      need_onboarding_contact: [
        'need_onboarding_contact',
        '是否需要入职联系',
        '入职材料是否需要集约收集',
        '入职联系',
      ],
      need_company_contract: [
        'need_company_contract',
        '是否企服发起劳动合同',
        '企服发起劳动合同',
      ],
    };

    for (const [target, keys] of Object.entries(aliases)) {
      if (this.isTruthyYes(normalized[target])) {
        normalized[target] = '是';
        continue;
      }
      const found = keys.map((key) => normalized[key]).find((value) => value !== undefined && value !== null && String(value).trim() !== '');
      if (found !== undefined) {
        normalized[target] = this.isTruthyYes(found) ? '是' : String(found).trim();
      }
    }

    return normalized;
  }

  private async ensureOnboardingSplitChildren(
    workOrder: WorkOrder,
    childrenToCreate: ChildToCreate[],
    manager?: EntityManager,
  ): Promise<void> {
    await this.ensureChild(childrenToCreate, 'data_entry', manager, 'onboarding-default-data-entry-fallback');
    await this.ensureChild(childrenToCreate, 'social_insurance', manager, 'onboarding-default-social-insurance-fallback');

    if (this.isTruthyYes(workOrder.extraData.need_onboarding_contact)) {
      await this.ensureChild(childrenToCreate, 'onboarding_contact', manager, 'onboarding-contact-when-needed-fallback');
    }

    if (this.isTruthyYes(workOrder.extraData.need_company_contract)) {
      await this.ensureChild(childrenToCreate, 'contract', manager, 'onboarding-contract-when-needed-fallback');
    }
  }

  private async ensureChild(
    childrenToCreate: ChildToCreate[],
    moduleCode: string,
    manager: EntityManager | undefined,
    ruleName: string,
  ): Promise<void> {
    if (childrenToCreate.some((child) => child.moduleCode === moduleCode)) {
      return;
    }

    const handlerId = await this.handlerPicker.pick(DispatchStrategy.FIXED, moduleCode, manager);
    const visibleFields = await this.fieldPermissionService.getVisibleFieldsForScenario(
      `dispatched:${moduleCode}`,
    );
    childrenToCreate.push({
      moduleCode,
      handlerId,
      visibleFields,
      ruleId: `fallback:${moduleCode}`,
      ruleName,
      dispatchStrategy: DispatchStrategy.FIXED,
    });
  }

  private isTruthyYes(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    const text = String(value ?? '').trim().toLowerCase();
    return ['是', 'yes', 'y', 'true', '1', '需要', '需', '生成'].includes(text);
  }

  private toAstNode(value: Record<string, unknown> | null): AstNode | null {
    if (value === null) {
      return null;
    }
    return value as unknown as AstNode;
  }

  private toDispatchedOrder(workOrder: WorkOrder, child: ChildToCreate): DispatchedOrder {
    const dispatchedOrder = new DispatchedOrder();
    dispatchedOrder.parentOrderId = workOrder.id;
    dispatchedOrder.moduleCode = child.moduleCode;
    dispatchedOrder.handlerId = child.handlerId;
    dispatchedOrder.visibleFields = child.visibleFields;
    dispatchedOrder.status = DispatchedOrderStatus.PENDING;
    dispatchedOrder.dispatchedAt = new Date();
    dispatchedOrder.dueAt = child.dueAt ?? null;
    dispatchedOrder.slaHours = child.slaHours ?? null;
    dispatchedOrder.slaReminderBeforeHours = child.slaReminderBeforeHours ?? null;
    dispatchedOrder.acceptedAt = null;
    dispatchedOrder.completedAt = null;
    dispatchedOrder.returnReason = null;
    return dispatchedOrder;
  }
}
