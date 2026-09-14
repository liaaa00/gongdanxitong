import { ForbiddenException } from '@nestjs/common';
import { BusinessScope, Customer } from 'src/entities';
import { CustomerRulesService } from 'src/modules/customer-rules/customer-rules.service';
import { CustomerPortalAccountsService } from 'src/modules/customer-portal-accounts/customer-portal-accounts.service';
import { JwtUserPayload } from 'src/modules/auth/auth.types';

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';

function user(roles: string[], sub = 'user-1'): JwtUserPayload {
  return { sub, username: sub, roles, businessScope: BusinessScope.BEILUN };
}

function customer(id: string): Customer {
  return {
    id,
    customerCode: id === C1 ? 'C001' : 'C002',
    customerName: id === C1 ? '客户一' : '客户二',
    isActive: true,
    businessScope: BusinessScope.BEILUN,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    branches: [],
    assignees: [],
    workOrders: [],
  };
}

describe('customer portal assignment permissions', () => {
  it('limits member rule listing and access to active customer assignments', async () => {
    const rows = [customer(C1), customer(C2)];
    let ids: string[] | undefined;
    const qb: any = {
      where: jest.fn(() => qb),
      andWhere: jest.fn((sql: string, params: any) => {
        if (sql.includes('IN (:...assignedCustomerIds)')) ids = params.assignedCustomerIds;
        return qb;
      }),
      orderBy: jest.fn(() => qb), addOrderBy: jest.fn(() => qb), skip: jest.fn(() => qb), take: jest.fn(() => qb),
      getManyAndCount: jest.fn(async () => [rows.filter((row) => !ids || ids.includes(row.id)), 1]),
      getOne: jest.fn(async () => rows[1]),
    };
    const customerRepository: any = { createQueryBuilder: jest.fn(() => qb) };
    const assigneeRepository: any = {
      find: jest.fn(async () => [{ customerId: C1 }]),
    };
    const ruleRepository: any = { createQueryBuilder: jest.fn(() => ({ where: jest.fn().mockReturnThis(), getMany: jest.fn().mockResolvedValue([]) })), findOne: jest.fn().mockResolvedValue(null) };
    const branchRepository: any = { find: jest.fn().mockResolvedValue([]) };
    const service = new CustomerRulesService(ruleRepository, customerRepository, { find: jest.fn() } as any, branchRepository, assigneeRepository);

    const result = await service.list({ page: 1, pageSize: 20 }, user(['business_group_member']));
    expect(result.total).toBe(1);
    expect(result.list[0].customerId).toBe(C1);
    expect(ids).toEqual([C1]);
    expect(assigneeRepository.find).toHaveBeenCalledWith({
      where: { userId: 'user-1', businessScope: BusinessScope.BEILUN, isActive: true },
      select: ['customerId'],
    });

    await expect(service.get(C2, user(['business_group_member']))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps manager rule configuration read-only while administrators can write', async () => {
    const customerRepository: any = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getOne: jest.fn().mockResolvedValue(customer(C1)),
      })),
    };
    const ruleRepository: any = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn((value) => value), save: jest.fn(async (value) => value) };
    const branchRepository: any = { find: jest.fn().mockResolvedValue([]) };
    const service = new CustomerRulesService(ruleRepository, customerRepository, { find: jest.fn() } as any, branchRepository, { find: jest.fn() } as any);

    await expect(service.upsert(C1, { isActive: true }, user(['business_owner']))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.upsert(C1, { isActive: true }, user(['admin']))).resolves.toMatchObject({ customerId: C1 });
  });

  it('limits portal account list and writes by assignment and manager read-only policy', async () => {
    const accounts = [{ id: 'a1', customerId: C1, loginEmail: 'a@example.test', contactName: '联系人', businessPermissions: ['salary'], isActive: true, mustChangePassword: false }];
    const accountRepository: any = {
      find: jest.fn(async ({ where }: any) => accounts.filter((item) => item.customerId === where.customerId)),
      findOne: jest.fn(async () => null),
      create: jest.fn((value) => value),
      save: jest.fn(),
      manager: { transaction: jest.fn() },
    };
    const customerRepository: any = { findOne: jest.fn(async ({ where }: any) => [C1, C2].includes(where.id) ? customer(where.id) : null) };
    const assigneeRepository: any = { findOne: jest.fn(async ({ where }: any) => where.customerId === C1 ? { customerId: C1 } : null) };
    const ruleRepository: any = { findOne: jest.fn().mockResolvedValue({ isActive: true, onboardingDefaults: {}, resignationDefaults: {}, salaryRules: { billingDay: 20 }, sharedEmailRules: { mailbox: 'shared@example.test' } }) };
    const notifications: any = { enqueueAccountActivation: jest.fn() };
    const service = new CustomerPortalAccountsService(accountRepository, customerRepository, { get: jest.fn(() => 'portal-test-secret-which-is-longer-than-32-characters') } as any, ruleRepository, notifications, assigneeRepository);

    await expect(service.list(C1, user(['business_group_member']))).resolves.toHaveLength(1);
    await expect(service.list(C2, user(['business_group_member']))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.create(C1, { loginEmail: 'new@example.test', contactName: '联系人', password: 'Password123', businessPermissions: ['salary'] }, user(['business_owner'])))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.list(C2, user(['business_owner']))).resolves.toEqual([]);
  });
});
