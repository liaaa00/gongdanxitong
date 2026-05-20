import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DispatchRule, DispatchStrategy, ModuleHandler, OrderType } from 'src/entities';
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
    const handlers = await this.moduleHandlerRepository.find({
      where: { isActive: true },
      relations: { handler: true },
      order: { moduleCode: 'ASC', isBackup: 'ASC', weight: 'DESC', id: 'ASC' },
    });

    const rules = await this.repository.find({
      where: { isActive: true },
      relations: { customer: true, assigneeUser: true, fallbackUser: true },
      order: { targetModule: 'ASC', subModule: 'ASC', priority: 'ASC', createdAt: 'ASC' },
    });

    const handlersByModule = new Map<string, ModuleHandler[]>();
    for (const handler of handlers) {
      const group = handlersByModule.get(handler.moduleCode) ?? [];
      group.push(handler);
      handlersByModule.set(handler.moduleCode, group);
    }

    const handlerRows = Array.from(handlersByModule.entries()).map(([moduleCode, moduleHandlers]) => {
      const ordered = [...moduleHandlers].sort((left, right) => {
        if (left.isBackup !== right.isBackup) return Number(left.isBackup) - Number(right.isBackup);
        return right.weight - left.weight || left.id.localeCompare(right.id);
      });

      return {
        id: ordered[0]?.id ?? moduleCode,
        source: 'handlers' as const,
        module: moduleCode,
        subModule: moduleCode,
        customerName: '全部客户',
        customerId: null,
        primary: this.toDispatchConfigPerson(ordered[0]),
        backup1: this.toDispatchConfigPerson(ordered[1]),
        backup2: this.toDispatchConfigPerson(ordered[2]),
      };
    });

    const ruleRows = rules.map((rule) => ({
      id: rule.id,
      source: 'rules' as const,
      module: rule.targetModule,
      subModule: rule.subModule ?? rule.targetModule,
      customerName: rule.customer?.customerName ?? (rule.customerId ? '指定客户' : '全部客户（按条件）'),
      customerId: rule.customerId,
      primary: this.toDispatchConfigPersonFromUser(rule.assigneeUserId, rule.assigneeUser),
      backup1: this.toDispatchConfigPersonFromUser(rule.fallbackUserId, rule.fallbackUser),
      backup2: null,
      advanced: {
        ruleName: rule.ruleName,
        orderType: rule.orderType,
        triggerConditions: rule.triggerConditions,
        departmentId: rule.departmentId,
        strategy: rule.dispatchStrategy,
        dispatchStrategy: rule.dispatchStrategy,
        allowManualOverride: rule.allowManualOverride,
        priority: rule.priority,
        isActive: rule.isActive,
      },
    }));

    return { rows: [...handlerRows, ...ruleRows] };
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
    return {
      userId,
      displayName: user?.realName ?? user?.username ?? userId,
    };
  }
}
