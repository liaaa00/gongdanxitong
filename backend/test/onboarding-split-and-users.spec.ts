import { Repository } from 'typeorm';
import { DispatchRule, DispatchStrategy, OrderType, RoleLevel, User, UserRole, WorkOrder } from 'src/entities';
import { DispatchEngineService } from 'src/modules/dispatch-engine/dispatch-engine.service';
import { AstEvaluator } from 'src/modules/dispatch-engine/ast-evaluator';
import { HandlerPickerService } from 'src/modules/dispatch-engine/handler-picker.service';
import { FieldPermissionService } from 'src/modules/field-permissions/field-permission.service';
import { UsersService } from 'src/modules/admin/users/users.service';

type RepoMock<T extends object> = Partial<Record<keyof Repository<T>, jest.Mock>>;

function repo<T extends object>(overrides: RepoMock<T> = {}): Repository<T> {
  return {
    createQueryBuilder: jest.fn(),
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
    findBy: jest.fn(async () => []),
    save: jest.fn(async (input) => input),
    count: jest.fn(async () => 0),
    delete: jest.fn(async () => ({ affected: 0 })),
    ...overrides,
  } as unknown as Repository<T>;
}

describe('onboarding split dispatch', () => {
  it('always creates data_entry and conditionally creates onboarding_contact/contract from Chinese aliases', async () => {
    const ruleRepo = repo<DispatchRule>({ find: jest.fn(async () => []) });
    const picker = {
      pick: jest.fn(async (_strategy: DispatchStrategy, moduleCode: string) => `handler-${moduleCode}`),
    } as unknown as HandlerPickerService;
    const fieldPermissionService = {
      getVisibleFieldsForScenario: jest.fn(async (scenario: string) => [scenario.replace('dispatched:', 'field:')]),
    } as unknown as FieldPermissionService;
    const service = new DispatchEngineService(
      ruleRepo,
      new AstEvaluator(),
      picker,
      fieldPermissionService,
    );

    const workOrder = Object.assign(new WorkOrder(), {
      id: 'wo-1',
      orderType: OrderType.ONBOARDING,
      extraData: {
        '是否需要入职联系': '是',
        '是否企服发起劳动合同': '是',
      },
    });

    const result = await service.evaluateDetailed(workOrder);

    expect(result.childrenToCreate.map((child) => child.moduleCode).sort()).toEqual([
      'contract',
      'data_entry',
      'onboarding_contact',
      'social_insurance',
    ]);
    expect(result.childrenToCreate).toEqual(expect.arrayContaining([
      expect.objectContaining({ moduleCode: 'data_entry', handlerId: 'handler-data_entry' }),
      expect.objectContaining({ moduleCode: 'social_insurance', handlerId: 'handler-social_insurance' }),
      expect.objectContaining({ moduleCode: 'onboarding_contact', handlerId: 'handler-onboarding_contact' }),
      expect.objectContaining({ moduleCode: 'contract', handlerId: 'handler-contract' }),
    ]));
  });

  it('does not create optional onboarding children when flags are no', async () => {
    const service = new DispatchEngineService(
      repo<DispatchRule>({ find: jest.fn(async () => []) }),
      new AstEvaluator(),
      { pick: jest.fn(async (_strategy: DispatchStrategy, moduleCode: string) => `handler-${moduleCode}`) } as unknown as HandlerPickerService,
      { getVisibleFieldsForScenario: jest.fn(async () => []) } as unknown as FieldPermissionService,
    );

    const result = await service.evaluateDetailed(Object.assign(new WorkOrder(), {
      id: 'wo-2',
      orderType: OrderType.ONBOARDING,
      extraData: {
        need_onboarding_contact: '否',
        need_company_contract: '否',
      },
    }));

    expect(result.childrenToCreate.map((child) => child.moduleCode)).toEqual(['data_entry', 'social_insurance']);
  });
});

describe('field and compatibility seeds', () => {
  it('marks mobile as required according to onboarding Excel template', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const fieldsSeed = readFileSync(join(process.cwd(), 'src/database/seeds/seed-fields.ts'), 'utf8');

    const mobileLine = fieldsSeed.split('\n').find((line) => line.includes("code: 'mobile'"));
    expect(mobileLine).toContain("name: '移动电话'");
    expect(mobileLine).toContain("required: true");
    expect(mobileLine).toContain("defaultRequired: true");
  });

  it('binds legacy QA accounts to active roles/departments so users page has roles', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const usersSeed = readFileSync(join(process.cwd(), 'src/database/seeds/seed-users.ts'), 'utf8');

    for (const username of ['socialsup01', 'dataentrysup01', 'onboardsup01', 'contractsup01', 'social01']) {
      expect(usersSeed).toContain(`username: '${username}'`);
    }
    expect(usersSeed).toContain("roleCode: 'shared_leader'");
    expect(usersSeed).toContain("roleCode: 'data_entry_leader'");
    expect(usersSeed).toContain("roleCode: 'contract_specialist'");
    expect(usersSeed).toContain("roleCode: 'onboarding_specialist'");
  });
});

describe('business group seeds', () => {
  it('keeps five configurable business groups in seed data', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const departmentsSeed = readFileSync(join(process.cwd(), 'src/database/seeds/seed-departments.ts'), 'utf8');
    const usersSeed = readFileSync(join(process.cwd(), 'src/database/seeds/seed-users.ts'), 'utf8');

    for (const groupNo of [1, 2, 3, 4, 5]) {
      expect(departmentsSeed).toContain(`BUSINESS_GROUP_${groupNo}`);
    }
    expect(usersSeed).toContain("liucheng@example.com");
    expect(usersSeed).toContain("BUSINESS_GROUP_4");
    expect(usersSeed).toContain("yuweiwei@example.com");
    expect(usersSeed).toContain("BUSINESS_GROUP_5");
  });
});

describe('UsersService role presentation', () => {
  it('returns flattened real role/department fields so user page does not show no-role', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn(),
      distinct: jest.fn(),
      andWhere: jest.fn(),
      orderBy: jest.fn(),
      skip: jest.fn(),
      take: jest.fn(),
      getManyAndCount: jest.fn(async () => [[Object.assign(new User(), {
        id: 'u-1',
        username: 'sales01',
        realName: '业务员一',
        email: 'sales01@example.com',
        phone: '13800000000',
        avatarUrl: null,
        isActive: true,
        lastLoginAt: null,
        createdAt: new Date('2026-05-14T00:00:00.000Z'),
        userRoles: [{
          roleId: 'r-1',
          departmentId: 'd-1',
          isPrimary: true,
          role: { id: 'r-1', code: 'biz_member', name: '业务员（组员）', level: RoleLevel.EXECUTION },
          department: { id: 'd-1', code: 'BUSINESS_GROUP_1', name: '业务1组' },
        } as unknown as UserRole],
      })], 1]),
    };
    qb.leftJoinAndSelect.mockReturnValue(qb);
    qb.distinct.mockReturnValue(qb);
    qb.andWhere.mockReturnValue(qb);
    qb.orderBy.mockReturnValue(qb);
    qb.skip.mockReturnValue(qb);
    qb.take.mockReturnValue(qb);

    const userRepo = repo<User>({ createQueryBuilder: jest.fn(() => qb) });
    const service = new UsersService(
      {} as never,
      userRepo,
      repo() as never,
      repo() as never,
      repo() as never,
      repo() as never,
    );

    const result = await service.list({ page: 1, pageSize: 20 });

    expect(result.list[0]).toMatchObject({
      real_name: '业务员一',
      group_name: '业务1组',
      role_codes: ['biz_member'],
      roles: [expect.objectContaining({ role_code: 'biz_member', role_name: '业务员（组员）' })],
    });
  });
});
