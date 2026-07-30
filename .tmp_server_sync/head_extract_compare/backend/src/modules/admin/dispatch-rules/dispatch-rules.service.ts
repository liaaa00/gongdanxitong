import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DispatchRule, DispatchStrategy, ModuleHandler, OrderType, WorkOrderModuleConfig } from 'src/entities';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { toPageResult } from 'src/common/types/pagination.types';
import { AstValidator } from 'src/modules/dispatch/ast.validator';
import { DispatchEngineService } from 'src/modules/dispatch/dispatch-engine.service';
import { AstNode } from 'src/modules/dispatch/types';

interface SaveDispatchRuleInput {
  ruleName: string;
  orderType: OrderType;
  targetModule: string;
  triggerConditions: AstNode | null;
  customerId?: string | null;
  customer_id?: string | null;
  departmentId?: string | null;
  department_id?: string | null;
  subModule?: string | null;
  sub_module?: string | null;
  assigneeUserId?: string | null;
  assignee_user_id?: string | null;
  fallbackUserId?: string | null;
  fallback_user_id?: string | null;
  allowManualOverride?: boolean;
  allow_manual_override?: boolean;
  dispatchStrategy: DispatchStrategy;
  priority: number;
  isActive?: boolean;
}

export interface DispatchConfigPerson {
  userId: string | null;
  displayName: string | null;
}

export interface DispatchConfigResponse {
  rows: Array<Record<string, unknown>>;
}

@Injectable()
export class DispatchRulesService {
  constructor(
    @InjectRepository(DispatchRule)
    private readonly repository: Repository<DispatchRule>,
    @InjectRepository(ModuleHandler)
    private readonly moduleHandlerRepository: Repository<ModuleHandler>,
    @InjectRepository(WorkOrderModuleConfig)
    private readonly moduleConfigRepository: Repository<WorkOrderModuleConfig>,
    private readonly astValidator: AstValidator,
    private readonly dispatchEngine: DispatchEngineService,
  ) {}

  async getList(query: PaginationQueryDto & { orderType?: OrderType; isActive?: boolean }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const qb = this.repository.createQueryBuilder('rule');

    if (query.orderType) {
      qb.andWhere('rule.orderType = :orderType', { orderType: query.orderType });
    }

    if (query.keyword) {
      qb.andWhere('rule.ruleName ILIKE :keyword', { keyword: `%${query.keyword}%` });
    }

    if (typeof query.isActive === 'boolean') {
      qb.andWhere('rule.isActive = :isActive', { isActive: query.isActive });
    }

    qb.orderBy('rule.priority', 'ASC').addOrderBy('rule.createdAt', 'DESC');

    const [rows, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return toPageResult(page, pageSize, total, rows);
  }

  async getDispatchConfig(): Promise<DispatchConfigResponse> {
    const [handlers, moduleConfigs] = await Promise.all([
      this.moduleHandlerRepository.find({
        where: { isActive: true, isBackup: false },
        relations: { handler: true },
        order: { moduleCode: 'ASC', weight: 'DESC', id: 'ASC' },
      }),
      this.moduleConfigRepository.find({ order: { displayOrder: 'ASC', moduleCode: 'ASC' } }),
    ]);

    const handlersByModule = new Map<string, ModuleHandler[]>();
    for (const handler of handlers) {
      const group = handlersByModule.get(handler.moduleCode) ?? [];
      group.push(handler);
      handlersByModule.set(handler.moduleCode, group);
    }

    const moduleCodes = Array.from(new Set([
      ...moduleConfigs.map((item) => item.moduleCode),
      ...handlersByModule.keys(),
    ])).filter(Boolean);

    const configByModule = new Map(moduleConfigs.map((item) => [item.moduleCode, item]));
    const rows = moduleCodes.map((moduleCode) => {
      const moduleConfig = configByModule.get(moduleCode);
      const orderedHandlers = [...(handlersByModule.get(moduleCode) ?? [])]
        .sort((left, right) => right.weight - left.weight || left.id.localeCompare(right.id));
      const people = orderedHandlers
        .map((handler) => this.toDispatchConfigPerson(handler))
        .filter((person): person is DispatchConfigPerson => Boolean(person));
      const handlerIds = orderedHandlers.map((handler) => handler.handlerId);

      return {
        id: moduleConfig?.id ?? orderedHandlers[0]?.id ?? moduleCode,
        source: 'handlers' as const,
        module: moduleCode,
        moduleCode,
        module_code: moduleCode,
        subModule: moduleCode,
        sub_module: moduleCode,
        moduleName: moduleConfig?.moduleName ?? moduleCode,
        module_name: moduleConfig?.moduleName ?? moduleCode,
        customerName: '全部客户',
        customerId: null,
        handlers: people,
        handlerIds,
        handler_ids: handlerIds,
        primary: people[0] ?? null,
        backup1: null,
        backup2: null,
        dispatchStrategy: moduleConfig?.dispatchStrategy ?? DispatchStrategy.TEAM_CLAIM,
        dispatch_strategy: moduleConfig?.dispatchStrategy ?? DispatchStrategy.TEAM_CLAIM,
        slaHours: moduleConfig?.slaHours ?? null,
        sla_hours: moduleConfig?.slaHours ?? null,
        slaReminderBeforeHours: moduleConfig?.slaReminderBeforeHours ?? null,
        sla_reminder_before_hours: moduleConfig?.slaReminderBeforeHours ?? null,
        isActive: moduleConfig?.isActive ?? true,
        is_active: moduleConfig?.isActive ?? true,
      };
    });

    return { rows };
  }

  async getById(id: string): Promise<DispatchRule> {
    const row = await this.repository.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('派发规则未找到');
    }

    return row;
  }

  async create(input: SaveDispatchRuleInput): Promise<DispatchRule> {
    this.astValidator.validate(input.triggerConditions);
    const entity = this.repository.create({
      ...this.normalizeInput(input),
      triggerConditions: input.triggerConditions as Record<string, unknown> | null,
      isActive: input.isActive ?? true,
    });

    return this.repository.save(entity);
  }

  async update(id: string, input: Partial<SaveDispatchRuleInput>): Promise<DispatchRule> {
    const row = await this.getById(id);

    if (input.triggerConditions !== undefined) {
      this.astValidator.validate(input.triggerConditions);
      row.triggerConditions = input.triggerConditions as Record<string, unknown> | null;
    }

    const { triggerConditions: _, ...rest } = input;
    Object.assign(row, this.normalizeInput(rest));
    return this.repository.save(row);
  }

  async softDelete(id: string): Promise<{ success: boolean }> {
    const row = await this.getById(id);
    row.isActive = false;
    await this.repository.save(row);
    return { success: true };
  }

  private normalizeInput(input: Partial<SaveDispatchRuleInput>): Partial<DispatchRule> {
    const {
      customer_id: _customerIdSnake,
      department_id: _departmentIdSnake,
      sub_module: _subModuleSnake,
      assignee_user_id: _assigneeUserIdSnake,
      fallback_user_id: _fallbackUserIdSnake,
      allow_manual_override: _allowManualOverrideSnake,
      triggerConditions: _triggerConditions,
      ...rest
    } = input;
    return {
      ...rest,
      customerId: input.customerId ?? input.customer_id ?? undefined,
      departmentId: input.departmentId ?? input.department_id ?? undefined,
      subModule: input.subModule ?? input.sub_module ?? undefined,
      assigneeUserId: input.assigneeUserId ?? input.assignee_user_id ?? undefined,
      fallbackUserId: input.fallbackUserId ?? input.fallback_user_id ?? undefined,
      allowManualOverride: input.allowManualOverride ?? input.allow_manual_override ?? undefined,
    };
  }

  async simulate(input: {
    orderType: OrderType;
    fields: Record<string, unknown>;
    ruleIds?: string[];
  }) {
    return this.dispatchEngine.evaluate(input);
  }

  private toDispatchConfigPerson(handler?: ModuleHandler): DispatchConfigPerson | null {
    if (!handler) return null;
    return this.toDispatchConfigPersonFromUser(handler.handlerId, handler.handler);
  }

  private toDispatchConfigPersonFromUser(
    userId?: string | null,
    user?: { realName?: string | null; username?: string | null } | null,
  ): DispatchConfigPerson | null {
    if (!userId) return null;
    return {
      userId,
      displayName: user?.realName ?? user?.username ?? userId,
    };
  }
}
