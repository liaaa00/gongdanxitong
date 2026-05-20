import { Repository } from 'typeorm';
import { DispatchRule, DispatchStrategy, OrderType, WorkOrder } from 'src/entities';
import { AstEvaluator } from 'src/modules/dispatch-engine/ast-evaluator';
import { DispatchEngineService } from 'src/modules/dispatch-engine/dispatch-engine.service';
import { FieldPermissionService } from 'src/modules/field-permissions/field-permission.service';
import { HandlerPickerService } from 'src/modules/dispatch-engine/handler-picker.service';

function makeRule(overrides: Partial<DispatchRule>): DispatchRule {
  return {
    id: overrides.id ?? `rule-${overrides.targetModule}`,
    ruleName: overrides.ruleName ?? `rule-${overrides.targetModule}`,
    orderType: overrides.orderType ?? OrderType.ONBOARDING,
    triggerConditions: overrides.triggerConditions ?? null,
    targetModule: overrides.targetModule ?? 'data_entry',
    dispatchStrategy: overrides.dispatchStrategy ?? DispatchStrategy.FIXED,
    isActive: overrides.isActive ?? true,
    priority: overrides.priority ?? 10,
    createdAt: new Date('2026-05-12T00:00:00.000Z'),
  } as DispatchRule;
}

function makeWorkOrder(orderType: OrderType, extraData: Record<string, unknown>): WorkOrder {
  return { id: 'wo-1', orderType, extraData } as WorkOrder;
}

describe('P7 DispatchEngine business routing', () => {
  function makeService(rules: DispatchRule[]) {
    const repo = {
      find: jest.fn(async (options: { where: { orderType: OrderType; isActive: boolean } }) =>
        rules.filter((rule) => rule.orderType === options.where.orderType && rule.isActive === options.where.isActive),
      ),
    } as unknown as Repository<DispatchRule>;
    const picker = { pick: jest.fn(async (_strategy: DispatchStrategy, moduleCode: string) => `handler-${moduleCode}`) } as unknown as HandlerPickerService;
    const permissions = { getVisibleFieldsForScenario: jest.fn(async (scenario: string) => [scenario]) } as unknown as FieldPermissionService;
    const service = new DispatchEngineService(repo, new AstEvaluator(), picker, permissions);
    return { service, repo, picker, permissions };
  }

  it('routes renewal orders to renewal_contract only', async () => {
    const { service } = makeService([
      makeRule({ orderType: OrderType.RENEWAL, targetModule: 'renewal_contract', priority: 10 }),
      makeRule({ orderType: OrderType.RENEWAL, targetModule: 'social_security', isActive: false, priority: 20 }),
    ]);

    const result = await service.evaluateDetailed(makeWorkOrder(OrderType.RENEWAL, { employee_name: 'Alice' }));

    expect(result.childrenToCreate.map((item) => item.moduleCode)).toEqual(['renewal_contract']);
    expect(result.childrenToCreate[0].handlerId).toBe('handler-renewal_contract');
  });

  it('routes resignation orders to contact and certificate modules by JSON AST', async () => {
    const { service } = makeService([
      makeRule({ orderType: OrderType.RESIGNATION, targetModule: 'resignation_contact', triggerConditions: { field: 'need_resignation_contact', op: 'EQ', value: '是' }, priority: 10 }),
      makeRule({ orderType: OrderType.RESIGNATION, targetModule: 'resignation_cert', triggerConditions: { field: 'need_resignation_cert', op: 'EQ', value: '是' }, priority: 20 }),
    ]);

    const result = await service.evaluateDetailed(makeWorkOrder(OrderType.RESIGNATION, {
      need_resignation_contact: '是',
      need_resignation_cert: '是',
    }));

    expect(result.childrenToCreate.map((item) => item.moduleCode)).toEqual(['resignation_contact', 'resignation_cert']);
  });

  it('routes benefit orders to benefit_apply and always queries active rules only', async () => {
    const { service, repo } = makeService([
      makeRule({ orderType: OrderType.BENEFIT, targetModule: 'benefit_apply', priority: 10 }),
      makeRule({ orderType: OrderType.BENEFIT, targetModule: 'social_security', isActive: false, priority: 1 }),
    ]);

    const result = await service.evaluateDetailed(makeWorkOrder(OrderType.BENEFIT, { benefit_type: 'medical' }));

    expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({
      where: { orderType: OrderType.BENEFIT, isActive: true },
    }));
    expect(result.childrenToCreate.map((item) => item.moduleCode)).toEqual(['benefit_apply']);
  });
});
