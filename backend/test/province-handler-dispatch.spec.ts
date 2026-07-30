import { Repository } from "typeorm";
import {
  DispatchRule,
  DispatchStrategy,
  ModuleHandler,
  ModuleType,
  OrderType,
  TeamRole,
  WorkOrder,
  WorkOrderModuleConfig,
} from "src/entities";
import { AstEvaluator } from "src/modules/dispatch-engine/ast-evaluator";
import { DispatchEngineService } from "src/modules/dispatch-engine/dispatch-engine.service";
import { HandlerPickerService } from "src/modules/dispatch-engine/handler-picker.service";

const SHEET4_MODULE = "in_service_single_business";
const SHEET5_MODULE = "out_of_province_dispatch";

type MappingSource = "sheet4" | "sheet5";
type PickerContext = { province?: string; mappingSource?: MappingSource };

type ModuleHandlerRepositoryMock = {
  find: jest.Mock;
  update: jest.Mock;
};

function namespacedModuleCode(moduleCode: string, province: string): string {
  return `${moduleCode}__${province}`;
}

function makeHandler(overrides: Partial<ModuleHandler>): ModuleHandler {
  return {
    id: overrides.id ?? `row-${overrides.handlerId}`,
    moduleCode: overrides.moduleCode ?? SHEET4_MODULE,
    handlerId: overrides.handlerId ?? "handler-default",
    weight: overrides.weight ?? 100,
    isBackup: overrides.isBackup ?? false,
    isActive: overrides.isActive ?? true,
    rrCursorVersion: overrides.rrCursorVersion ?? 0,
    handler: overrides.handler ?? ({ isActive: true } as never),
  } as ModuleHandler;
}

function makePicker(rows: ModuleHandler[]): {
  picker: HandlerPickerService;
  repository: ModuleHandlerRepositoryMock;
} {
  const repository: ModuleHandlerRepositoryMock = {
    find: jest.fn(
      async (options: { where: { moduleCode: string; isActive: boolean } }) =>
        rows.filter(
          (row) =>
            row.moduleCode === options.where.moduleCode &&
            row.isActive === options.where.isActive,
        ),
    ),
    update: jest.fn(async () => ({ affected: 1 })),
  };
  return {
    picker: new HandlerPickerService(
      repository as unknown as Repository<ModuleHandler>,
      {} as never,
      undefined,
    ),
    repository,
  };
}

function makeRule(overrides: Partial<DispatchRule>): DispatchRule {
  return {
    id: overrides.id ?? `rule-${overrides.targetModule}`,
    ruleName: overrides.ruleName ?? `rule-${overrides.targetModule}`,
    orderType: overrides.orderType ?? OrderType.IN_SERVICE,
    triggerConditions: overrides.triggerConditions ?? null,
    targetModule: overrides.targetModule ?? SHEET4_MODULE,
    subModule: overrides.subModule ?? null,
    dispatchStrategy: overrides.dispatchStrategy ?? DispatchStrategy.TEAM_CLAIM,
    isActive: overrides.isActive ?? true,
    priority: overrides.priority ?? 10,
    customerId: overrides.customerId ?? null,
    departmentId: overrides.departmentId ?? null,
    createdAt: new Date("2026-07-27T00:00:00.000Z"),
  } as DispatchRule;
}

function makeEngine(
  rules: DispatchRule[],
  mappedHandler: string | null,
): {
  service: DispatchEngineService;
  picker: { pick: jest.Mock };
} {
  const rulesRepository = {
    find: jest.fn(async () => rules),
  } as unknown as Repository<DispatchRule>;
  const moduleConfigRepository = {
    find: jest.fn(async () =>
      rules.map((rule) => ({
        moduleCode: rule.subModule ?? rule.targetModule,
        dispatchStrategy: DispatchStrategy.TEAM_CLAIM,
        slaHours: null,
        slaReminderBeforeHours: null,
      })),
    ),
  } as unknown as Repository<WorkOrderModuleConfig>;
  const moduleHandlerRepository = {
    find: jest.fn(async () => []),
  } as unknown as Repository<ModuleHandler>;
  const picker = {
    pick: jest.fn(
      async (
        _strategy: DispatchStrategy,
        _moduleCode: string,
        _manager?: unknown,
        context?: PickerContext,
      ) => (context?.mappingSource ? mappedHandler : null),
    ),
  };
  const service = new DispatchEngineService(
    rulesRepository,
    moduleConfigRepository,
    moduleHandlerRepository,
    new AstEvaluator(),
    picker as unknown as HandlerPickerService,
    {
      getVisibleFieldsForScenario: jest.fn(async () => ["employee_name"]),
    } as never,
  );
  return { service, picker };
}

describe("province handler contract", () => {
  it("keeps the accepted enum values stable", () => {
    expect(ModuleType.IN_SERVICE).toBe("in_service");
    expect(ModuleType.OUT_OF_PROVINCE).toBe("out_of_province");
    expect(TeamRole.IN_SERVICE).toBe("in_service_team");
    expect(TeamRole.OUT_OF_PROVINCE).toBe("out_of_province_team");
    expect(OrderType.IN_SERVICE).toBe("in_service");
    expect(OrderType.OUT_OF_PROVINCE_INCREASE).toBe("out_of_province_increase");
    expect(OrderType.OUT_OF_PROVINCE_DECREASE).toBe("out_of_province_decrease");
  });

  it("routes an ordinary province through independent Sheet4 and Sheet5 keys", async () => {
    const { picker } = makePicker([
      makeHandler({
        moduleCode: namespacedModuleCode(SHEET4_MODULE, "广东"),
        handlerId: "sheet4-guangdong",
      }),
      makeHandler({
        moduleCode: namespacedModuleCode(SHEET5_MODULE, "广东"),
        handlerId: "sheet5-guangdong",
      }),
    ]);

    await expect(
      picker.pick(DispatchStrategy.FIXED, SHEET4_MODULE, undefined, {
        province: "广东",
        mappingSource: "sheet4",
      }),
    ).resolves.toBe("sheet4-guangdong");
    await expect(
      picker.pick(DispatchStrategy.FIXED, SHEET5_MODULE, undefined, {
        province: "广东",
        mappingSource: "sheet5",
      }),
    ).resolves.toBe("sheet5-guangdong");
  });

  it.each(["湖北", "江苏", "山西", "山东", "福建"])(
    "keeps the first configured handler as the default for dual-owner %s",
    async (province) => {
      const key = namespacedModuleCode(SHEET4_MODULE, province);
      const { picker } = makePicker([
        makeHandler({
          id: `${province}-backup-row`,
          moduleCode: key,
          handlerId: `${province}-backup`,
          weight: 1,
          isBackup: true,
        }),
        makeHandler({
          id: `${province}-primary-row`,
          moduleCode: key,
          handlerId: `${province}-primary`,
          weight: 100,
          isBackup: false,
        }),
      ]);

      const context: PickerContext = {
        province,
        mappingSource: "sheet4",
      };
      await expect(
        picker.pick(DispatchStrategy.FIXED, SHEET4_MODULE, undefined, context),
      ).resolves.toBe(`${province}-primary`);
      await expect(
        picker.pick(DispatchStrategy.FIXED, SHEET4_MODULE, undefined, context),
      ).resolves.toBe(`${province}-primary`);
    },
  );

  it("does not use the backup as an initial assignee when the primary is inactive", async () => {
    const key = namespacedModuleCode(SHEET4_MODULE, "福建");
    const { picker } = makePicker([
      makeHandler({
        moduleCode: key,
        handlerId: "inactive-primary",
        isActive: false,
        isBackup: false,
      }),
      makeHandler({
        moduleCode: key,
        handlerId: "transfer-only-backup",
        isBackup: true,
        weight: 1,
      }),
    ]);

    await expect(
      picker.pick(DispatchStrategy.FIXED, SHEET4_MODULE, undefined, {
        province: "福建",
        mappingSource: "sheet4",
      }),
    ).resolves.toBeNull();
  });

  it("never falls back from a missing Sheet4 mapping to Sheet5", async () => {
    const { picker } = makePicker([
      makeHandler({
        moduleCode: namespacedModuleCode(SHEET5_MODULE, "广东"),
        handlerId: "sheet5-only",
      }),
    ]);

    await expect(
      picker.pick(DispatchStrategy.FIXED, SHEET4_MODULE, undefined, {
        province: "广东",
        mappingSource: "sheet4",
      }),
    ).resolves.toBeNull();
  });

  it("keeps the existing fixed strategy unchanged without mapping context", async () => {
    const { picker, repository } = makePicker([
      makeHandler({
        id: "legacy-low-row",
        moduleCode: "renewal_contract",
        handlerId: "legacy-low",
        weight: 1,
      }),
      makeHandler({
        id: "legacy-high-row",
        moduleCode: "renewal_contract",
        handlerId: "legacy-high",
        weight: 10,
      }),
    ]);

    await expect(
      picker.pick(DispatchStrategy.FIXED, "renewal_contract"),
    ).resolves.toBe("legacy-high");
    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { moduleCode: "renewal_contract", isActive: true },
      }),
    );
  });
});

describe("province dispatch engine integration", () => {
  it("creates an in-service child assigned through Sheet4", async () => {
    const rule = makeRule({
      id: "rule-in-service",
      orderType: OrderType.IN_SERVICE,
      targetModule: SHEET4_MODULE,
    });
    const { service, picker } = makeEngine([rule], "sheet4-fujian-primary");
    const workOrder = {
      id: "in-service-1",
      orderType: OrderType.IN_SERVICE,
      extraData: { province: "福建" },
    } as unknown as WorkOrder;

    const dispatched = await service.evaluate(workOrder);

    expect(dispatched[0]).toEqual(
      expect.objectContaining({
        parentOrderId: "in-service-1",
        moduleCode: SHEET4_MODULE,
        handlerId: "sheet4-fujian-primary",
        status: "pending",
      }),
    );
    expect(picker.pick).toHaveBeenCalledWith(
      expect.anything(),
      SHEET4_MODULE,
      undefined,
      expect.objectContaining({
        province: "福建",
        mappingSource: "sheet4",
      }),
    );
  });

  it.each([
    OrderType.OUT_OF_PROVINCE_INCREASE,
    OrderType.OUT_OF_PROVINCE_DECREASE,
  ])("creates %s child assigned through Sheet5", async (orderType) => {
    const rule = makeRule({
      id: `rule-${orderType}`,
      orderType,
      targetModule: SHEET5_MODULE,
    });
    const { service, picker } = makeEngine([rule], "sheet5-guangdong-primary");
    const workOrder = {
      id: `order-${orderType}`,
      orderType,
      extraData: { province: "广东" },
    } as unknown as WorkOrder;

    const dispatched = await service.evaluate(workOrder);

    expect(dispatched[0]).toEqual(
      expect.objectContaining({
        parentOrderId: `order-${orderType}`,
        moduleCode: SHEET5_MODULE,
        handlerId: "sheet5-guangdong-primary",
        status: "pending",
      }),
    );
    expect(picker.pick).toHaveBeenCalledWith(
      expect.anything(),
      SHEET5_MODULE,
      undefined,
      expect.objectContaining({
        province: "广东",
        mappingSource: "sheet5",
      }),
    );
  });
});

describe("legacy dispatch regression", () => {
  it.each([
    {
      orderType: OrderType.RENEWAL,
      moduleCode: "renewal_contract",
      handlerId: "legacy-renewal-handler",
    },
    {
      orderType: OrderType.RESIGNATION,
      moduleCode: "resignation_contact",
      handlerId: "legacy-resignation-handler",
    },
  ])(
    "keeps $orderType on the existing module handler path",
    async ({ orderType, moduleCode, handlerId }) => {
      const rule = makeRule({
        id: `rule-${orderType}`,
        orderType,
        targetModule: moduleCode,
        triggerConditions: null,
        dispatchStrategy: DispatchStrategy.FIXED,
      });
      Object.assign(rule, {
        assigneeUserId: "dead-assignee-field",
        fallbackUserId: "dead-fallback-field",
      });
      const rulesRepository = {
        find: jest.fn(async () => [rule]),
      } as unknown as Repository<DispatchRule>;
      const configsRepository = {
        find: jest.fn(async () => []),
      } as unknown as Repository<WorkOrderModuleConfig>;
      const moduleHandlerRepository = {
        find: jest.fn(async () => [
          makeHandler({ moduleCode, handlerId, weight: 10 }),
        ]),
      } as unknown as Repository<ModuleHandler>;
      const picker = {
        pick: jest.fn(async () => "unexpected-picker-handler"),
      } as unknown as HandlerPickerService;
      const service = new DispatchEngineService(
        rulesRepository,
        configsRepository,
        moduleHandlerRepository,
        new AstEvaluator(),
        picker,
        { getVisibleFieldsForScenario: jest.fn(async () => []) } as never,
      );

      const result = await service.evaluateDetailed({
        id: `legacy-${orderType}`,
        orderType,
        extraData: { province: "福建" },
      } as unknown as WorkOrder);

      expect(result.childrenToCreate[0]).toEqual(
        expect.objectContaining({ moduleCode, handlerId }),
      );
      expect(picker.pick).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ mappingSource: expect.anything() }),
      );
    },
  );
});
