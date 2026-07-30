import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { canHandleModule, getRequiredModuleHandlerRoles } from 'src/common/auth/role-permissions';
import { DispatchedOrder, DispatchedOrderStatus, DispatchRule, DispatchStrategy, ModuleHandler, OrderType, User, WorkOrderModuleConfig } from 'src/entities';
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
  isActive: boolean;
  roleCodes: string[];
  openOrderCount: number;
}

export interface DispatchConfigResponse {
  rows: Array<Record<string, unknown>>;
}

export interface SaveModuleDispatchConfigInput {
  handlerIds: string[];
  dispatchStrategy: DispatchStrategy;
  slaHours?: number | null;
  slaReminderBeforeHours?: number | null;
  isActive: boolean;
  changeReason?: string;
}

@Injectable()
export class DispatchRulesService {
  constructor(
    private readonly dataSource: DataSource,
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
        relations: { handler: { userRoles: { role: true } } },
        order: { moduleCode: 'ASC', weight: 'DESC', id: 'ASC' },
      }),
      this.moduleConfigRepository.find({ order: { displayOrder: 'ASC', moduleCode: 'ASC' } }),
    ]);

    const handlerIds = Array.from(new Set(handlers.map((handler) => handler.handlerId)));
    const openRows = handlerIds.length > 0
      ? await this.dataSource.getRepository(DispatchedOrder)
          .createQueryBuilder('order')
          .select('order.handler_id', 'handlerId')
          .addSelect('COUNT(order.id)', 'openCount')
          .where('order.handler_id IN (:...handlerIds)', { handlerIds })
          .andWhere('order.status IN (:...statuses)', {
            statuses: [DispatchedOrderStatus.PENDING, DispatchedOrderStatus.PROCESSING],
          })
          .groupBy('order.handler_id')
          .getRawMany<{ handlerId: string; openCount: string }>()
      : [];
    const openCountByHandler = new Map(openRows.map((row) => [row.handlerId, Number(row.openCount)]));

    const handlersByModule = new Map<string, ModuleHandler[]>();
    for (const handler of handlers) {
      const group = handlersByModule.get(handler.moduleCode) ?? [];
      group.push(handler);
      handlersByModule.set(handler.moduleCode, group);
    }

    const dispatchableModuleConfigs = moduleConfigs.filter((item) =>
      item.moduleType === 'sub_module'
      || Boolean(item.parentModuleCode)
      || handlersByModule.has(item.moduleCode));
    const moduleCodes = Array.from(new Set([
      ...dispatchableModuleConfigs.map((item) => item.moduleCode),
      ...handlersByModule.keys(),
    ])).filter(Boolean);

    const configByModule = new Map(moduleConfigs.map((item) => [item.moduleCode, item]));
    const rows = moduleCodes.map((moduleCode) => {
      const moduleConfig = configByModule.get(moduleCode);
      const orderedHandlers = [...(handlersByModule.get(moduleCode) ?? [])]
        .sort((left, right) => right.weight - left.weight || left.id.localeCompare(right.id));
      const people = orderedHandlers
        .map((handler) => this.toDispatchConfigPerson(handler, openCountByHandler))
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

  async saveModuleDispatchConfig(
    moduleCode: string,
    input: SaveModuleDispatchConfigInput,
  ): Promise<Record<string, unknown>> {
    const handlerIds = Array.from(new Set(input.handlerIds));
    if (handlerIds.length === 0) {
      throw new BadRequestException('请至少选择一名共同负责人');
    }
    if (handlerIds.length !== input.handlerIds.length) {
      throw new BadRequestException('共同负责人不能重复');
    }

    return this.dataSource.transaction(async (manager) => {
      const moduleConfig = await manager.findOne(WorkOrderModuleConfig, {
        where: { moduleCode },
        lock: { mode: 'pessimistic_write' },
      });
      if (!moduleConfig) {
        throw new NotFoundException(`模块 ${moduleCode} 不存在`);
      }

      const users = await manager.find(User, {
        where: { id: In(handlerIds), isActive: true },
        relations: { userRoles: { role: true } },
      });
      if (users.length !== handlerIds.length) {
        throw new BadRequestException('共同负责人中包含不存在或已停用的账号');
      }
      for (const user of users) {
        const roles = user.userRoles
          .filter((binding) => binding.role?.isActive)
          .map((binding) => binding.role.code);
        if (!canHandleModule(moduleCode, roles)) {
          const required = getRequiredModuleHandlerRoles(moduleCode);
          throw new BadRequestException(`${user.realName} 缺少模块 ${moduleCode} 所需角色：${required.join('、')}`);
        }
      }

      const existing = await manager.find(ModuleHandler, { where: { moduleCode } });
      const selected = new Set(handlerIds);
      for (const row of existing) {
        if (!selected.has(row.handlerId)) {
          row.isActive = false;
        }
      }

      for (let index = 0; index < handlerIds.length; index += 1) {
        const handlerId = handlerIds[index];
        const row = existing.find((item) => item.handlerId === handlerId)
          ?? manager.create(ModuleHandler, { moduleCode, handlerId });
        row.weight = handlerIds.length - index;
        row.isBackup = false;
        row.isActive = true;
        if (!existing.includes(row)) existing.push(row);
      }
      await manager.save(ModuleHandler, existing);

      moduleConfig.dispatchStrategy = input.dispatchStrategy;
      moduleConfig.slaHours = input.slaHours ?? null;
      moduleConfig.slaReminderBeforeHours = input.slaReminderBeforeHours ?? null;
      moduleConfig.isActive = input.isActive;
      await manager.save(WorkOrderModuleConfig, moduleConfig);

      return {
        moduleCode,
        handlerIds,
        dispatchStrategy: moduleConfig.dispatchStrategy,
        slaHours: moduleConfig.slaHours,
        slaReminderBeforeHours: moduleConfig.slaReminderBeforeHours,
        isActive: moduleConfig.isActive,
        changeReason: input.changeReason?.trim() || null,
      };
    });
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

  private toDispatchConfigPerson(
    handler: ModuleHandler | undefined,
    openCountByHandler: ReadonlyMap<string, number>,
  ): DispatchConfigPerson | null {
    if (!handler) return null;
    return this.toDispatchConfigPersonFromUser(
      handler.handlerId,
      handler.handler,
      openCountByHandler.get(handler.handlerId) ?? 0,
    );
  }

  private toDispatchConfigPersonFromUser(
    userId: string | null | undefined,
    user: User | null | undefined,
    openOrderCount: number,
  ): DispatchConfigPerson | null {
    if (!userId) return null;
    return {
      userId,
      displayName: user?.realName ?? user?.username ?? userId,
      isActive: user?.isActive ?? false,
      roleCodes: Array.from(new Set((user?.userRoles ?? [])
        .filter((binding) => binding.role?.isActive)
        .map((binding) => binding.role.code))),
      openOrderCount,
    };
  }
}
