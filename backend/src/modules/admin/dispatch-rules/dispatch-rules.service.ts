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
  user_id: string | null;
  displayName: string | null;
  display_name: string | null;
  realName?: string | null;
  real_name?: string | null;
  username?: string | null;
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
    private readonly moduleRepository: Repository<WorkOrderModuleConfig>,
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
    const [modules, handlers] = await Promise.all([
      this.moduleRepository.find({
        order: { displayOrder: 'ASC', moduleCode: 'ASC' },
      }),
      this.moduleHandlerRepository.find({
        where: { isActive: true },
        relations: { handler: true },
        order: { moduleCode: 'ASC', isBackup: 'ASC', weight: 'DESC', id: 'ASC' },
      }),
    ]);

    const handlersByModule = new Map<string, ModuleHandler[]>();
    for (const handler of handlers) {
      const group = handlersByModule.get(handler.moduleCode) ?? [];
      group.push(handler);
      handlersByModule.set(handler.moduleCode, group);
    }

    const rows = modules
      .filter((module) => !['business_module', 'main'].includes(module.moduleType))
      .map((module) => {
        const moduleHandlers = [...(handlersByModule.get(module.moduleCode) ?? [])].sort((left, right) => {
          if (left.isBackup !== right.isBackup) return Number(left.isBackup) - Number(right.isBackup);
          return right.weight - left.weight || left.id.localeCompare(right.id);
        });
        const handlerPeople = moduleHandlers.map((handler) => this.toDispatchConfigPerson(handler));

        return {
          id: module.id,
          source: 'handlers' as const,
          module: module.moduleName,
          moduleName: module.moduleName,
          module_name: module.moduleName,
          moduleCode: module.moduleCode,
          module_code: module.moduleCode,
          subModule: module.moduleCode,
          sub_module: module.moduleCode,
          parentModuleCode: module.parentModuleCode,
          parent_module_code: module.parentModuleCode,
          customerName: '全部客户',
          customer_name: '全部客户',
          customerId: null,
          customer_id: null,
          primary: handlerPeople[0] ?? null,
          backup1: handlerPeople[1] ?? null,
          backup2: handlerPeople[2] ?? null,
          handlers: handlerPeople,
          handlerIds: moduleHandlers.map((handler) => handler.handlerId),
          handler_ids: moduleHandlers.map((handler) => handler.handlerId),
          dispatchStrategy: module.dispatchStrategy ?? DispatchStrategy.POOL,
          dispatch_strategy: module.dispatchStrategy ?? DispatchStrategy.POOL,
          slaHours: module.slaHours ?? 72,
          sla_hours: module.slaHours ?? 72,
          isActive: module.isActive,
          is_active: module.isActive,
        };
      });

    return { rows };
  }

  async getById(id: string): Promise<DispatchRule> {
    const row = await this.repository.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('dispatch rule not found');
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
    const displayName = user?.realName ?? user?.username ?? userId;
    return {
      userId,
      user_id: userId,
      displayName,
      display_name: displayName,
      realName: user?.realName ?? null,
      real_name: user?.realName ?? null,
      username: user?.username ?? null,
    };
  }
}
