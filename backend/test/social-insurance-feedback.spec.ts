import { HttpStatus } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  DispatchedOrder,
  DispatchedOrderStatus,
  FieldConfig,
  ModuleField,
  ModuleHandler,
  ModuleSupervisor,
  Notification,
  OperationLog,
  RoleLevel,
  UserRole,
  WorkOrder,
  WorkOrderStatus,
} from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { FieldPermissionService } from 'src/modules/field-permissions/field-permission.service';
import { FieldSupplementService } from 'src/modules/field-supplement/field-supplement.service';
import { DispatchedOrderService } from 'src/modules/dispatched-orders/dispatched-order.service';
import { WorkOrderValidationService } from 'src/modules/work-orders/work-order-validation.service';
import { FeedbackDispatchedOrderDto } from 'src/modules/dispatched-orders/dto/feedback.dto';

function repoMock<T extends object>(overrides: Partial<Record<string, unknown>> = {}): Repository<T> {
  return {
    create: jest.fn((input: Partial<T>) => input as T),
    save: jest.fn(async (input: T) => input),
    findOne: jest.fn(async () => null),
    find: jest.fn(async () => []),
    count: jest.fn(async () => 0),
    delete: jest.fn(async () => ({ affected: 1 })),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => []),
      getManyAndCount: jest.fn(async () => [[], 0]),
    })),
    manager: { transaction: jest.fn() },
    ...overrides,
  } as unknown as Repository<T>;
}

function makeSocialInsuranceOrder(
  overrides: Partial<DispatchedOrder & { parentOrder: Partial<WorkOrder> }> = {},
): DispatchedOrder {
  return {
    id: 'do-social-1',
    parentOrderId: 'wo-1',
    parentOrder: {
      id: 'wo-1',
      orderNo: 'ON20260630001',
      orderType: 'onboarding',
      status: WorkOrderStatus.PROCESSING,
      createdBy: 'creator-1',
      departmentId: 'd1',
      customerId: 'c1',
      employeeName: '张三',
      employeeIdCard: '330102199001010011',
      extraData: {},
      submittedAt: new Date(),
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastModifiedAt: new Date(),
      lastModifiedBy: null,
      modificationRound: 0,
      ...((overrides.parentOrder as Partial<WorkOrder>) ?? {}),
    } as WorkOrder,
    moduleCode: 'social_insurance',
    status: DispatchedOrderStatus.PROCESSING,
    handlerId: 'fuqianwen-id',
    visibleFields: [],
    returnReason: null,
    voidAt: null,
    dispatchedAt: new Date(),
    acceptedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    flowRound: 0,
    ...overrides,
  } as unknown as DispatchedOrder;
}

function makeService(opts: {
  order: DispatchedOrder;
  supervisorCount?: number;
  userRoleRows?: UserRole[];
} = { order: makeSocialInsuranceOrder() }) {
  const order = opts.order;
  const dispatchedOrderRepo = repoMock<DispatchedOrder>({
    findOne: jest.fn(async () => order),
    save: jest.fn(async (o: DispatchedOrder) => o),
  });
  const workOrderRepo = repoMock<WorkOrder>({
    save: jest.fn(async (o: WorkOrder) => o),
  });
  const moduleHandlerRepo = repoMock<ModuleHandler>({ count: jest.fn(async () => 0) });
  const userRoleRepo = repoMock<UserRole>({ find: jest.fn(async () => opts.userRoleRows ?? []) });
  const moduleSupervisorRepo = repoMock<ModuleSupervisor>({
    count: jest.fn(async () => (opts.supervisorCount ?? 0)),
  });
  const operationLogRepo = repoMock<OperationLog>({ save: jest.fn(async () => null) });
  const fieldPermissionService = {
    getPermissionsForUser: jest.fn(async () => new Map()),
    applyExtraData: jest.fn((_, data) => data),
    applyFieldViews: jest.fn((_, data) => data),
  } as unknown as FieldPermissionService;
  const fieldSupplementService = { supplement: jest.fn(), getLogs: jest.fn(async () => []) } as unknown as FieldSupplementService;
  const exportTemplatesService = { exportSingleDispatchedOrder: jest.fn() };

  const service = new DispatchedOrderService(
    dispatchedOrderRepo,
    workOrderRepo,
    moduleHandlerRepo,
    userRoleRepo,
    repoMock<FieldConfig>(),
    repoMock<Notification>(),
    operationLogRepo,
    fieldPermissionService,
    fieldSupplementService,
    exportTemplatesService as never,
    { validateWorkOrder: jest.fn(), validateFields: jest.fn() } as unknown as WorkOrderValidationService,
    undefined,
    undefined,
    undefined,
    repoMock<ModuleField>(),
    moduleSupervisorRepo,
  );
  return { service, dispatchedOrderRepo, workOrderRepo, operationLogRepo };
}

const ALL_COMPLETED_PAYLOAD: FeedbackDispatchedOrderDto = {
  social_insurance_result: '是',
  medical_insurance_result: '是',
  housing_fund_result: '是',
  social_insurance_remark: '均已办理',
};

const PARTIAL_PAYLOAD: FeedbackDispatchedOrderDto = {
  social_insurance_result: '是',
  medical_insurance_result: '否',
  housing_fund_result: '是',
};

const FEEDBACK_MODULE_CODES = ['social_insurance', 'resignation_social_insurance'] as const;

describe.each(FEEDBACK_MODULE_CODES)('%s 4-field feedback', (moduleCode) => {
  const makeOrder = (overrides: Partial<DispatchedOrder & { parentOrder: Partial<WorkOrder> }> = {}) => makeSocialInsuranceOrder({ moduleCode, ...overrides });

  describe('auto-complete logic', () => {
    it('sets order COMPLETED when all three results are 是', async () => {
      const order = makeOrder({ status: DispatchedOrderStatus.PROCESSING });
      const { service, dispatchedOrderRepo } = makeService({ order, supervisorCount: 0 });
      const user: JwtUserPayload = { sub: 'fuqianwen-id', username: 'fuqianwen', roles: [] } as JwtUserPayload;

      await service.feedback('do-social-1', ALL_COMPLETED_PAYLOAD, user);

      const savedCall = (dispatchedOrderRepo.save as jest.Mock).mock.calls[0][0] as DispatchedOrder;
      expect(savedCall.status).toBe(DispatchedOrderStatus.COMPLETED);
      expect(savedCall.completedAt).not.toBeNull();
    });

    it('keeps order PROCESSING when any result is 否', async () => {
      const order = makeOrder({ status: DispatchedOrderStatus.PROCESSING });
      const { service, dispatchedOrderRepo } = makeService({ order, supervisorCount: 0 });
      const user: JwtUserPayload = { sub: 'fuqianwen-id', username: 'fuqianwen', roles: [] } as JwtUserPayload;

      await service.feedback('do-social-1', PARTIAL_PAYLOAD, user);

      const savedCall = (dispatchedOrderRepo.save as jest.Mock).mock.calls[0][0] as DispatchedOrder;
      expect(savedCall.status).toBe(DispatchedOrderStatus.PROCESSING);
      expect(savedCall.completedAt).toBeNull();
    });

    it('keeps order PROCESSING when called from PENDING status with partial results', async () => {
      const order = makeOrder({ status: DispatchedOrderStatus.PENDING });
      const { service, dispatchedOrderRepo } = makeService({ order, supervisorCount: 0 });
      const user: JwtUserPayload = { sub: 'fuqianwen-id', username: 'fuqianwen', roles: [] } as JwtUserPayload;

      await service.feedback('do-social-1', PARTIAL_PAYLOAD, user);

      const savedCall = (dispatchedOrderRepo.save as jest.Mock).mock.calls[0][0] as DispatchedOrder;
      expect(savedCall.status).toBe(DispatchedOrderStatus.PROCESSING);
    });

    it('writes all four feedback fields to parentOrder.extraData', async () => {
      const order = makeOrder({ status: DispatchedOrderStatus.PROCESSING });
      const { service, workOrderRepo } = makeService({ order, supervisorCount: 0 });
      const user: JwtUserPayload = { sub: 'fuqianwen-id', username: 'fuqianwen', roles: [] } as JwtUserPayload;

      await service.feedback('do-social-1', ALL_COMPLETED_PAYLOAD, user);

      const savedWork = (workOrderRepo.save as jest.Mock).mock.calls[0][0] as WorkOrder;
      expect(savedWork.extraData).toMatchObject({
        social_insurance_result: '是',
        medical_insurance_result: '是',
        housing_fund_result: '是',
        social_insurance_remark: '均已办理',
      });
    });
  });

  describe('permission checks', () => {
    it('allows the assigned handler (fuqianwen) to submit feedback', async () => {
      const order = makeSocialInsuranceOrder({ handlerId: 'fuqianwen-id' });
      const { service } = makeService({ order, supervisorCount: 0 });
      const user: JwtUserPayload = { sub: 'fuqianwen-id', username: 'fuqianwen', roles: [] } as JwtUserPayload;

      await expect(service.feedback('do-social-1', ALL_COMPLETED_PAYLOAD, user)).resolves.not.toThrow();
    });

    it('allows a module supervisor (via ModuleSupervisor config) to submit feedback', async () => {
      const order = makeSocialInsuranceOrder({ handlerId: 'other-handler' });
      const { service } = makeService({
        order,
        supervisorCount: 1,
        userRoleRows: [{ role: { level: RoleLevel.SUPERVISOR } } as UserRole],
      });
      const user: JwtUserPayload = { sub: 'supervisor-id', username: 'supervisor', roles: [] } as JwtUserPayload;

      await expect(service.feedback('do-social-1', ALL_COMPLETED_PAYLOAD, user)).resolves.not.toThrow();
    });

    it('rejects a non-handler non-supervisor user with 403 FORBIDDEN', async () => {
      const order = makeSocialInsuranceOrder({ handlerId: 'fuqianwen-id' });
      const { service } = makeService({ order, supervisorCount: 0 });
      const user: JwtUserPayload = { sub: 'salesperson-1', username: 'sales01', roles: ['sales'] } as JwtUserPayload;

      await expect(service.feedback('do-social-1', ALL_COMPLETED_PAYLOAD, user))
        .rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    });

    it('rejects business_owner role even if in ModuleSupervisor table', async () => {
      const order = makeSocialInsuranceOrder({ handlerId: 'fuqianwen-id' });
      const { service } = makeService({ order, supervisorCount: 1 });
      const user: JwtUserPayload = { sub: 'manager-1', username: 'manager01', roles: ['business_owner'] } as JwtUserPayload;

      await expect(service.feedback('do-social-1', ALL_COMPLETED_PAYLOAD, user))
        .rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    });

    it('allows admin to submit feedback regardless of handlerId', async () => {
      const order = makeSocialInsuranceOrder({ handlerId: 'fuqianwen-id' });
      const { service } = makeService({ order, supervisorCount: 0 });
      const user: JwtUserPayload = { sub: 'admin-1', username: 'admin', roles: ['admin'] } as JwtUserPayload;

      await expect(service.feedback('do-social-1', ALL_COMPLETED_PAYLOAD, user)).resolves.not.toThrow();
    });
  });

  describe('field validation', () => {
    it('throws 4224 when social_insurance_result has an invalid value', async () => {
      const order = makeSocialInsuranceOrder({ status: DispatchedOrderStatus.PROCESSING });
      const { service } = makeService({ order, supervisorCount: 0 });
      const user: JwtUserPayload = { sub: 'fuqianwen-id', username: 'fuqianwen', roles: [] } as JwtUserPayload;

      await expect(service.feedback('do-social-1', {
        social_insurance_result: 'YES',
        medical_insurance_result: '是',
        housing_fund_result: '是',
      }, user)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('throws 4224 when housing_fund_result is empty string', async () => {
      const order = makeSocialInsuranceOrder({ status: DispatchedOrderStatus.PROCESSING });
      const { service } = makeService({ order, supervisorCount: 0 });
      const user: JwtUserPayload = { sub: 'fuqianwen-id', username: 'fuqianwen', roles: [] } as JwtUserPayload;

      await expect(service.feedback('do-social-1', {
        social_insurance_result: '是',
        medical_insurance_result: '是',
        housing_fund_result: '',
      }, user)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });
  });

  describe('field alias normalization', () => {
    it('accepts social_security_result alias and maps to social_insurance_result', async () => {
      const order = makeSocialInsuranceOrder({ status: DispatchedOrderStatus.PROCESSING });
      const { service, workOrderRepo } = makeService({ order, supervisorCount: 0 });
      const user: JwtUserPayload = { sub: 'fuqianwen-id', username: 'fuqianwen', roles: [] } as JwtUserPayload;

      await service.feedback('do-social-1', {
        social_security_result: '是',
        medical_insurance_result: '是',
        housing_fund_result: '是',
      } as FeedbackDispatchedOrderDto, user);

      const savedWork = (workOrderRepo.save as jest.Mock).mock.calls[0][0] as WorkOrder;
      expect(savedWork.extraData).toMatchObject({ social_insurance_result: '是' });
    });

    it('accepts camelCase housingFundResult alias', async () => {
      const order = makeSocialInsuranceOrder({ status: DispatchedOrderStatus.PROCESSING });
      const { service, workOrderRepo } = makeService({ order, supervisorCount: 0 });
      const user: JwtUserPayload = { sub: 'fuqianwen-id', username: 'fuqianwen', roles: [] } as JwtUserPayload;

      await service.feedback('do-social-1', {
        social_insurance_result: '是',
        medical_insurance_result: '是',
        housingFundResult: '是',
      } as FeedbackDispatchedOrderDto, user);

      const savedWork = (workOrderRepo.save as jest.Mock).mock.calls[0][0] as WorkOrder;
      expect(savedWork.extraData).toMatchObject({ housing_fund_result: '是' });
    });
  });

  describe('status guard', () => {
    it('throws 409 when order is already COMPLETED', async () => {
      const order = makeSocialInsuranceOrder({ status: DispatchedOrderStatus.COMPLETED });
      const { service } = makeService({ order, supervisorCount: 0 });
      const user: JwtUserPayload = { sub: 'fuqianwen-id', username: 'fuqianwen', roles: [] } as JwtUserPayload;

      await expect(service.feedback('do-social-1', ALL_COMPLETED_PAYLOAD, user))
        .rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    });

    it('throws 409 when parent work order is voided', async () => {
      const order = makeSocialInsuranceOrder({
        status: DispatchedOrderStatus.PROCESSING,
        parentOrder: { id: 'wo-1', orderNo: 'ON20260630001', orderType: 'onboarding', status: WorkOrderStatus.VOID, createdBy: 'creator-1', departmentId: 'd1', customerId: 'c1', employeeName: '张三', employeeIdCard: '330102199001010011', extraData: {}, submittedAt: new Date(), completedAt: null, createdAt: new Date(), updatedAt: new Date(), lastModifiedAt: new Date(), lastModifiedBy: null, modificationRound: 0 } as WorkOrder,
      });
      const { service } = makeService({ order, supervisorCount: 0 });
      const user: JwtUserPayload = { sub: 'fuqianwen-id', username: 'fuqianwen', roles: [] } as JwtUserPayload;

      await expect(service.feedback('do-social-1', ALL_COMPLETED_PAYLOAD, user))
        .rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    });
  });
});
