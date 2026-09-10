import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { validateSync } from 'class-validator';
import { Repository } from 'typeorm';
import * as JSZip from 'jszip';
import { BusinessScope, DispatchModuleCode, DispatchedOrder, DispatchedOrderStatus, FieldConfig, FieldPermissionMode, ModuleField, ModuleHandler, Notification, OperationLog, OrderType, RoleLevel, User, UserRole, WorkOrder, WorkOrderFieldDirtyMark, WorkOrderStatus } from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { FieldPermissionService } from 'src/modules/field-permissions/field-permission.service';
import { FieldSupplementService } from 'src/modules/field-supplement/field-supplement.service';
import { BatchCompleteDispatchedOrderDto } from 'src/modules/dispatched-orders/dto/batch-complete.dto';
import { BatchReassignStrategy } from 'src/modules/dispatched-orders/dto/batch-reassign.dto';
import { ListDispatchedOrderQueryDto } from 'src/modules/dispatched-orders/dto/list-query.dto';
import { DispatchedOrderService } from 'src/modules/dispatched-orders/dispatched-order.service';

function repoMock<T extends object>(overrides: Partial<Record<string, unknown>> = {}): Repository<T> {
  return {
    create: jest.fn((input: Partial<T>) => input as T),
    save: jest.fn(async (input: T) => input),
    findOne: jest.fn(async () => null),
    find: jest.fn(async () => []),
    count: jest.fn(async () => 0),
    delete: jest.fn(async () => ({ affected: 1 })),
    createQueryBuilder: jest.fn(),
    manager: { transaction: jest.fn() },
    ...overrides,
  } as unknown as Repository<T>;
}

const validationServiceMock = { resolveUserDepartmentIds: jest.fn(async () => ['d1']) };

function qbMock(rows: DispatchedOrder[], total = rows.length) {
  const qb = {
    leftJoinAndSelect: jest.fn(),
    andWhere: jest.fn(),
    addSelect: jest.fn(),
    orderBy: jest.fn(),
    offset: jest.fn(),
    limit: jest.fn(),
    getManyAndCount: jest.fn(async () => [rows, total]),
  };
  qb.leftJoinAndSelect.mockReturnValue(qb);
  qb.andWhere.mockReturnValue(qb);
  qb.addSelect.mockReturnValue(qb);
  qb.orderBy.mockReturnValue(qb);
  qb.offset.mockReturnValue(qb);
  qb.limit.mockReturnValue(qb);
  return qb;
}

describe('DispatchedOrderService', () => {
  function makeDispatchedOrder(status: DispatchedOrderStatus = DispatchedOrderStatus.PENDING): DispatchedOrder {
    return { id: `do-${status}`, parentOrderId: 'wo-1', parentOrder: { id: 'wo-1', orderNo: 'ON20260511001', orderType: 'onboarding', status: WorkOrderStatus.PROCESSING, createdBy: 'u1', departmentId: 'd1', customerId: 'c1', employeeName: 'employee', employeeIdCard: '330102199001010011', extraData: {}, submittedAt: null, completedAt: null, createdAt: new Date(), updatedAt: new Date() }, moduleCode: 'data_entry', status, handlerId: 'handler-1', visibleFields: ['employee_name'], returnReason: null, dispatchedAt: new Date(), acceptedAt: status === DispatchedOrderStatus.PROCESSING ? new Date() : null, completedAt: null, createdAt: new Date(), updatedAt: new Date() } as unknown as DispatchedOrder;
  }

  function makeService(moduleHandlerRepoOverrides: Partial<Record<string, unknown>> = {}, rows: DispatchedOrder[] = [makeDispatchedOrder()]) {
    const queryBuilder = qbMock(rows, rows.length);
    const dispatchedOrderRepo = repoMock<DispatchedOrder>({ createQueryBuilder: jest.fn(() => queryBuilder) });
    const workOrderRepo = repoMock<WorkOrder>();
    const moduleHandlerRepo = repoMock<ModuleHandler>({ find: jest.fn(async () => [{ moduleCode: 'data_entry', handlerId: 'user-1', isActive: true } as unknown as ModuleHandler]), ...moduleHandlerRepoOverrides });
    const userRoleRepo = repoMock<UserRole>({ find: jest.fn(async () => [{ role: { level: RoleLevel.EXECUTION } } as unknown as UserRole]) });
    const fieldConfigRepo = repoMock<FieldConfig>();
    const notificationRepo = repoMock<Notification>();
    const operationLogRepo = repoMock<OperationLog>();
    const fieldPermissionService = { getPermissionsForUser: jest.fn(), applyExtraData: jest.fn(), applyFieldViews: jest.fn() } as unknown as FieldPermissionService;
    const fieldSupplementService = { supplement: jest.fn(), getLogs: jest.fn() } as unknown as FieldSupplementService;
    const exportTemplatesService = {
      exportSingleDispatchedOrder: jest.fn(),
      exportDispatchedOrdersAuto: jest.fn(),
    };
    const validationService = { resolveUserDepartmentIds: jest.fn(async () => ['d1']) };
    const service = new DispatchedOrderService(dispatchedOrderRepo, workOrderRepo, moduleHandlerRepo, userRoleRepo, fieldConfigRepo, notificationRepo, operationLogRepo, fieldPermissionService, fieldSupplementService, exportTemplatesService as never, validationService as never);
    return { service, queryBuilder };
  }

  it('creates and notifies a resignation certificate only once after material collection completes', async () => {
    const { service } = makeService();
    const parentOrder = Object.assign(new WorkOrder(), {
      id: 'wo-resignation',
      orderNo: 'RS20260819001',
      orderType: OrderType.RESIGNATION,
      status: WorkOrderStatus.PROCESSING,
      extraData: { need_resignation_share: '是', need_resignation_cert: '是' },
    });
    const materialOrder = Object.assign(new DispatchedOrder(), {
      id: 'material-1',
      parentOrderId: parentOrder.id,
      parentOrder,
      moduleCode: 'resignation_contact',
      status: DispatchedOrderStatus.COMPLETED,
    });
    const certificateOrder = Object.assign(new DispatchedOrder(), {
      id: 'certificate-1',
      parentOrderId: parentOrder.id,
      moduleCode: 'resignation_cert',
      status: DispatchedOrderStatus.PENDING,
      handlerId: 'certificate-handler',
    });
    const automation = {
      ensureForWorkOrder: jest.fn()
        .mockResolvedValueOnce({ order: certificateOrder, created: true })
        .mockResolvedValueOnce({ order: certificateOrder, created: false }),
    };
    Object.defineProperty(service, 'resignationCertificateAutomationService', { value: automation });
    const operationLogRepository = repoMock<OperationLog>();
    const notificationRepository = repoMock<Notification>();
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === OperationLog) return operationLogRepository;
        if (entity === Notification) return notificationRepository;
        throw new Error('unexpected repository');
      }),
    };

    await (service as any).ensureResignationCertificateAfterMaterials(materialOrder, 'handler-1', manager);
    await (service as any).ensureResignationCertificateAfterMaterials(materialOrder, 'handler-1', manager);

    expect(automation.ensureForWorkOrder).toHaveBeenCalledWith(parentOrder, 'materials_completed', manager);
    expect(operationLogRepository.save).toHaveBeenCalledTimes(1);
    expect(operationLogRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      entityId: certificateOrder.id,
      actionType: 'dispatched',
    }));
    expect(notificationRepository.save).toHaveBeenCalledTimes(1);
    expect(notificationRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'certificate-handler',
      link: `/dispatched-orders/${certificateOrder.id}`,
    }));
  });

  it('exposes the related data-entry status for a contract child order', () => {
    const { service } = makeService();
    const order = { ...makeDispatchedOrder(), moduleCode: 'contract' } as DispatchedOrder;

    const result = (service as any).toListItem(order, [], { data_entry: 'completed' });

    expect(result).toMatchObject({
      dataEntryStatus: 'completed',
      data_entry_status: 'completed',
      related_module_statuses: { data_entry: 'completed' },
    });
  });

  it('filters list results and paginates with offset/limit', async () => {
    const rows = [{ id: 'do-1', parentOrderId: 'wo-1', parentOrder: { id: 'wo-1', orderNo: 'ON20260511001', orderType: 'onboarding', status: WorkOrderStatus.PROCESSING, createdBy: 'u1', departmentId: 'd1', customerId: 'c1', employeeName: '张三', employeeIdCard: '330102199001010011', extraData: {}, submittedAt: null, completedAt: null, createdAt: new Date(), updatedAt: new Date() }, moduleCode: 'data_entry', status: DispatchedOrderStatus.PENDING, handlerId: 'handler-1', visibleFields: ['employee_name'], returnReason: null, dispatchedAt: new Date(), acceptedAt: null, completedAt: null, createdAt: new Date(), updatedAt: new Date() } as unknown as DispatchedOrder];
    const queryBuilder = qbMock(rows, 1);
    const dispatchedOrderRepo = repoMock<DispatchedOrder>({ createQueryBuilder: jest.fn(() => queryBuilder) });
    const workOrderRepo = repoMock<WorkOrder>();
    const moduleHandlerRepo = repoMock<ModuleHandler>({ find: jest.fn(async () => [{ moduleCode: 'data_entry', handlerId: 'user-1', isActive: true } as unknown as ModuleHandler]) });
    const userRoleRepo = repoMock<UserRole>({ find: jest.fn(async () => [{ role: { level: RoleLevel.EXECUTION } } as unknown as UserRole]) });
    const fieldConfigRepo = repoMock<FieldConfig>();
    const notificationRepo = repoMock<Notification>();
    const operationLogRepo = repoMock<OperationLog>();
    const fieldPermissionService = { getPermissionsForUser: jest.fn(), applyExtraData: jest.fn(), applyFieldViews: jest.fn() } as unknown as FieldPermissionService;
    const fieldSupplementService = { supplement: jest.fn(), getLogs: jest.fn() } as unknown as FieldSupplementService;
    const exportTemplatesService = { exportSingleDispatchedOrder: jest.fn() };
    const validationService = { resolveUserDepartmentIds: jest.fn(async () => ['d1']) };
    const service = new DispatchedOrderService(dispatchedOrderRepo, workOrderRepo, moduleHandlerRepo, userRoleRepo, fieldConfigRepo, notificationRepo, operationLogRepo, fieldPermissionService, fieldSupplementService, exportTemplatesService as never, validationService as never);
    const user: JwtUserPayload = { sub: 'user-1', username: 'dataentry01', roles: ['data_entry_team'] } as JwtUserPayload;

    const result = await service.findAll({ page: 1, pageSize: 20, moduleCode: 'data_entry' } as never, user);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('d.module_code = :moduleCode'), { moduleCode: 'data_entry' });
    expect(queryBuilder.addSelect).toHaveBeenCalledWith(
      expect.stringContaining("CASE WHEN d.status IN ('returned','modify_pending')"),
      'status_priority',
    );
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('status_priority', 'ASC');
    expect(queryBuilder.offset).toHaveBeenCalledWith(0);
    expect(queryBuilder.limit).toHaveBeenCalledWith(20);
    expect(result.total).toBe(1);
    expect(result.items[0].handlerId).toBe('handler-1');
  });

  it('filters contract rows by sibling data-entry status before pagination and combines own status', async () => {
    const { service, queryBuilder } = makeService();
    const user: JwtUserPayload = { sub: 'admin-1', username: 'admin', roles: ['admin'] } as JwtUserPayload;

    await service.findAll({
      page: 2,
      pageSize: 20,
      moduleCode: 'contract',
      statuses: ['pending'],
      dataEntryStatuses: ['processing', 'completed'],
    } as never, user);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('d.status = :status', { status: DispatchedOrderStatus.PENDING });
    const relatedFilterCallIndex = queryBuilder.andWhere.mock.calls.findIndex(([statement, params]) => (
      String(statement).includes('FROM dispatched_orders data_entry_order')
      && String(statement).includes('data_entry_order.parent_order_id = d.parent_order_id')
      && String(statement).includes('data_entry_order.status IN (:...dataEntryStatuses)')
      && (params as Record<string, unknown>)?.dataEntryModuleCode === DispatchModuleCode.DATA_ENTRY
    ));
    expect(relatedFilterCallIndex).toBeGreaterThanOrEqual(0);
    expect(queryBuilder.andWhere.mock.calls[relatedFilterCallIndex][1]).toMatchObject({
      dataEntryStatuses: [DispatchedOrderStatus.PROCESSING, DispatchedOrderStatus.COMPLETED],
    });
    expect(queryBuilder.andWhere.mock.invocationCallOrder[relatedFilterCallIndex])
      .toBeLessThan(queryBuilder.offset.mock.invocationCallOrder[0]);
    expect(queryBuilder.offset).toHaveBeenCalledWith(20);
  });

  it('filters contract rows by a single sibling data-entry status with an equality EXISTS', async () => {
    const { service, queryBuilder } = makeService();
    const user: JwtUserPayload = { sub: 'admin-1', username: 'admin', roles: ['admin'] } as JwtUserPayload;

    await service.findAll({
      page: 1,
      pageSize: 20,
      moduleCode: 'contract',
      dataEntryStatuses: ['pending'],
    } as never, user);

    const relatedFilterCall = queryBuilder.andWhere.mock.calls.find(([statement, params]) => (
      String(statement).includes('data_entry_order.status = :dataEntryStatus')
      && (params as Record<string, unknown>)?.dataEntryStatus === DispatchedOrderStatus.PENDING
    ));
    expect(relatedFilterCall).toBeTruthy();
    expect(queryBuilder.andWhere.mock.calls.some(([statement]) => (
      String(statement).includes('data_entry_order.status IN (:...dataEntryStatuses)')
    ))).toBe(false);
    expect(queryBuilder.andWhere.mock.invocationCallOrder[
      queryBuilder.andWhere.mock.calls.findIndex(([statement]) => String(statement).includes('data_entry_order.status = :dataEntryStatus'))
    ]).toBeLessThan(queryBuilder.offset.mock.invocationCallOrder[0]);
  });

  it('keeps payroll bank cards in a complete export list and scopes business users to their own orders', async () => {
    const payrollOrder = {
      ...makeDispatchedOrder(),
      moduleCode: 'payroll_bank_card',
      handlerId: null,
      parentOrder: {
        ...makeDispatchedOrder().parentOrder,
        extraData: {
          need_payroll_slip: '否',
          bank_name: '中国银行',
          bank_account: '6222000000000000',
          bank_location: '宁波',
          payroll_location: '宁波',
        },
      },
    } as DispatchedOrder;
    const { service, queryBuilder } = makeService({}, [payrollOrder]);

    await expect(service.findAll({
      page: 1,
      pageSize: 20,
      moduleCode: 'payroll_bank_card',
    } as never, {
      sub: 'admin-1',
      username: 'admin',
      roles: ['admin'],
    } as JwtUserPayload)).resolves.toMatchObject({ total: 1 });

    const sql = queryBuilder.andWhere.mock.calls.map(([statement]) => String(statement)).join('\n');
    expect(sql).not.toContain('need_payroll_slip');
    expect(sql).not.toContain('bank_name');

    await expect(service.findAll({
      page: 1,
      pageSize: 20,
      moduleCode: 'payroll_bank_card',
    } as never, {
      sub: 'u1',
      username: 'sales01',
      roles: ['business_group_member'],
    } as JwtUserPayload)).resolves.toMatchObject({ total: 1 });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'w.created_by = :payrollUserId',
      { payrollUserId: 'u1' },
    );

    await expect(service.findAll({
      page: 1,
      pageSize: 20,
      moduleCode: 'payroll_bank_card',
    } as never, {
      sub: 'user-1',
      username: 'dataentry01',
      roles: ['data_entry_team'],
    } as JwtUserPayload)).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      message: '薪酬银行卡导出清单无权访问',
    });
  });

  it('excludes payroll bank cards from generic dispatched-order lists', async () => {
    const { service, queryBuilder } = makeService();

    await service.findAll({ page: 1, pageSize: 20 } as never, {
      sub: 'admin-1',
      username: 'admin',
      roles: ['admin'],
    } as JwtUserPayload);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'd.module_code <> :exportOnlyModule',
      { exportOnlyModule: 'payroll_bank_card' },
    );
  });

  it('normalizes the insured unit from the labor contract subject in list results', async () => {
    const order = {
      ...makeDispatchedOrder(),
      moduleCode: 'social_insurance',
      parentOrder: {
        ...makeDispatchedOrder().parentOrder,
        extraData: {
          contract_subject: '劳动合同主体值',
          social_location: '缴纳地值',
          insured_unit: '历史参保单位',
        },
      },
    } as DispatchedOrder;
    const { service } = makeService({}, [order]);
    const user: JwtUserPayload = {
      sub: 'user-1',
      username: 'social01',
      roles: ['social_insurance_specialist'],
    } as JwtUserPayload;

    const result = await service.findAll({
      page: 1,
      pageSize: 20,
      moduleCode: 'social_insurance',
    } as never, user);

    expect(result.items[0].extra_data).toMatchObject({
      contract_subject: '劳动合同主体值',
      social_location: '缴纳地值',
      insured_unit: '劳动合同主体值',
    });
  });

  it('restores current contract fields for a returned business creator despite a stale visible-fields snapshot', async () => {
    const order = {
      ...makeDispatchedOrder(DispatchedOrderStatus.RETURNED),
      moduleCode: 'contract',
      visibleFields: ['employee_name'],
      parentOrder: {
        ...makeDispatchedOrder().parentOrder,
        createdBy: 'u1',
        extraData: {
          employee_name: '张三',
          mobile: '"13800000000 "',
          bank_name: '不应展示',
        },
      },
      handler: null,
    } as DispatchedOrder;
    const fieldConfigRepo = repoMock<FieldConfig>({
      find: jest.fn(async () => [
        { fieldCode: 'employee_name', fieldName: '姓名', fieldType: 'text', orderType: OrderType.ONBOARDING, businessContext: [OrderType.ONBOARDING], isActive: true, displayOrder: 1 } as unknown as FieldConfig,
        { fieldCode: 'mobile', fieldName: '手机号', fieldType: 'text', orderType: OrderType.ONBOARDING, businessContext: [OrderType.ONBOARDING], isActive: true, displayOrder: 2 } as unknown as FieldConfig,
        { fieldCode: 'bank_name', fieldName: '银行', fieldType: 'text', orderType: OrderType.ONBOARDING, businessContext: [OrderType.ONBOARDING], isActive: true, displayOrder: 3 } as unknown as FieldConfig,
      ]),
    });
    const fieldPermissionService = {
      getPermissionsForUser: jest.fn(async () => new Map([
        ['employee_name', FieldPermissionMode.VISIBLE],
        ['mobile', FieldPermissionMode.VISIBLE],
        ['bank_name', FieldPermissionMode.HIDDEN],
      ])),
    } as unknown as FieldPermissionService;
    const service = new DispatchedOrderService(
      repoMock<DispatchedOrder>({ findOne: jest.fn(async () => order) }),
      repoMock<WorkOrder>(),
      repoMock<ModuleHandler>(),
      repoMock<UserRole>(),
      fieldConfigRepo,
      repoMock<Notification>(),
      repoMock<OperationLog>(),
      fieldPermissionService,
      { getLogs: jest.fn() } as unknown as FieldSupplementService,
      { exportSingleDispatchedOrder: jest.fn() } as never,
      validationServiceMock as never,
    );

    const result = await service.findOne(order.id, {
      sub: 'u1',
      username: 'zhaotianqi',
      roles: ['biz_member'],
    } as JwtUserPayload);

    expect(fieldPermissionService.getPermissionsForUser).toHaveBeenCalledWith(
      'u1',
      'dispatched:contract',
      BusinessScope.BEILUN,
    );
    expect(result.fields.map((field) => field.fieldCode)).toEqual(['employee_name', 'mobile']);
    expect(result.fields.find((field) => field.fieldCode === 'mobile')).toMatchObject({
      value: '13800000000',
      permission: FieldPermissionMode.VISIBLE,
    });
    expect(result.extra_data?.mobile).toBe('13800000000');
  });

  it('exposes newly configured dynamic template fields to the original business creator', async () => {
    const order = {
      ...makeDispatchedOrder(DispatchedOrderStatus.PENDING),
      visibleFields: ['employee_name'],
      parentOrder: {
        ...makeDispatchedOrder().parentOrder,
        createdBy: 'u1',
        extraData: { employee_name: '张三' },
      },
    } as DispatchedOrder;
    const allFields = [
      { fieldCode: 'employee_name', fieldName: '姓名', isIncludedInTemplate: true },
      { fieldCode: 'mobile', fieldName: '手机号', isIncludedInTemplate: true },
      { fieldCode: 'custom_province_note', fieldName: '省份特殊说明', isIncludedInTemplate: true },
      { fieldCode: 'custom_internal_note', fieldName: '内部字段', isIncludedInTemplate: false },
    ].map((field, index) => ({
      ...field,
      fieldType: 'text',
      orderType: OrderType.ONBOARDING,
      businessContext: [OrderType.ONBOARDING],
      isActive: true,
      displayOrder: index,
      isRequired: false,
      defaultRequired: false,
    } as unknown as FieldConfig));
    const fieldPermissionService = {
      getPermissionsForUser: jest.fn(async () => new Map(
        allFields.map((field) => [field.fieldCode, FieldPermissionMode.VISIBLE]),
      )),
    } as unknown as FieldPermissionService;
    const service = new DispatchedOrderService(
      repoMock<DispatchedOrder>({ findOne: jest.fn(async () => order) }),
      repoMock<WorkOrder>(),
      repoMock<ModuleHandler>(),
      repoMock<UserRole>(),
      repoMock<FieldConfig>({ find: jest.fn(async () => allFields) }),
      repoMock<Notification>(),
      repoMock<OperationLog>(),
      fieldPermissionService,
      { getLogs: jest.fn() } as unknown as FieldSupplementService,
      { exportSingleDispatchedOrder: jest.fn() } as never,
      validationServiceMock as never,
    );

    const result = await service.findOne(order.id, {
      sub: 'u1',
      username: 'sales',
      roles: ['business_group_member'],
    } as JwtUserPayload);

    expect(result.fields.map((field) => field.fieldCode)).toEqual([
      'employee_name',
      'custom_province_note',
    ]);
    expect(result.visibleFields).toEqual(['employee_name', 'custom_province_note']);
    expect(result.workOrderUpdatedAt).toBe(order.parentOrder.updatedAt);
    expect(result.work_order_updated_at).toBe(order.parentOrder.updatedAt);
  });

  it('keeps social input fields when module fields only configure handling feedback', async () => {
    const order = {
      ...makeDispatchedOrder(DispatchedOrderStatus.PROCESSING),
      moduleCode: 'social_insurance',
      visibleFields: ['social_insurance_result'],
      parentOrder: {
        ...makeDispatchedOrder().parentOrder,
        businessScope: BusinessScope.BEILUN,
        extraData: {
          gender: '女',
          birth_date: '1991-01-18',
          social_insurance_result: null,
        },
      },
    } as DispatchedOrder;
    const allFields = [
      { fieldCode: 'gender', fieldName: '性别', displayOrder: 1 },
      { fieldCode: 'birth_date', fieldName: '出生日期', displayOrder: 2 },
      { fieldCode: 'social_insurance_result', fieldName: '社保是否办结', displayOrder: 3 },
    ].map((field) => ({
      ...field,
      fieldType: 'text',
      orderType: OrderType.ONBOARDING,
      businessContext: [OrderType.ONBOARDING],
      isActive: true,
      isRequired: false,
      defaultRequired: false,
    } as unknown as FieldConfig));
    const fieldPermissionService = {
      getPermissionsForUser: jest.fn(async () => new Map(allFields.map((field) => [
        field.fieldCode,
        FieldPermissionMode.VISIBLE,
      ]))),
    } as unknown as FieldPermissionService;
    const moduleFieldRepo = repoMock<ModuleField>({
      find: jest.fn(async () => [{
        moduleCode: 'social_insurance',
        fieldCode: 'social_insurance_result',
        businessScope: BusinessScope.BEILUN,
        displayOrder: 1,
        isActive: true,
      } as unknown as ModuleField]),
    });
    const service = new DispatchedOrderService(
      repoMock<DispatchedOrder>({ findOne: jest.fn(async () => order) }),
      repoMock<WorkOrder>(),
      repoMock<ModuleHandler>(),
      repoMock<UserRole>(),
      repoMock<FieldConfig>({ find: jest.fn(async () => allFields) }),
      repoMock<Notification>(),
      repoMock<OperationLog>(),
      fieldPermissionService,
      { getLogs: jest.fn() } as unknown as FieldSupplementService,
      { exportSingleDispatchedOrder: jest.fn() } as never,
      validationServiceMock as never,
      undefined,
      undefined,
      undefined,
      moduleFieldRepo,
    );

    const result = await service.findOne(order.id, {
      sub: 'social-id',
      username: 'fuqianwen',
      roles: ['social_insurance_specialist'],
      businessScope: BusinessScope.BEILUN,
    } as JwtUserPayload);

    expect(fieldPermissionService.getPermissionsForUser).toHaveBeenCalledWith(
      'social-id',
      'dispatched:social_insurance',
      BusinessScope.BEILUN,
    );
    expect(result.visibleFields).toEqual([
      'social_insurance_result',
      'gender',
      'birth_date',
    ]);
    expect(result.fields.map((field) => field.fieldCode)).toEqual([
      'social_insurance_result',
      'gender',
      'birth_date',
    ]);
  });

  it('limits resignation certificate details to formal certificate fields', async () => {
    const order = {
      ...makeDispatchedOrder(DispatchedOrderStatus.PENDING),
      moduleCode: 'resignation_cert',
      visibleFields: ['customer_name', 'social_insurance_result', 'resignation_reason'],
      parentOrder: {
        ...makeDispatchedOrder().parentOrder,
        orderType: OrderType.RESIGNATION,
        extraData: { customer_name: '客户A', resignation_reason: '合同到期' },
      },
    } as DispatchedOrder;
    const allFields = [
      'customer_name', 'customer_code', 'mobile', 'email', 'position',
      'employee_name', 'id_card_no', 'resignation_reason', 'resignation_date',
      'need_resignation_cert', 'cert_delivery_address', 'resignation_cert_status',
      'social_insurance_result', 'social_insurance_remark',
    ].map((fieldCode, index) => ({
      fieldCode,
      fieldName: fieldCode,
      fieldType: 'text',
      orderType: OrderType.RESIGNATION,
      businessContext: [OrderType.RESIGNATION],
      isActive: true,
      displayOrder: index,
      isRequired: false,
      defaultRequired: false,
    } as unknown as FieldConfig));
    const fieldConfigRepo = repoMock<FieldConfig>({ find: jest.fn(async () => allFields) });
    const fieldPermissionService = {
      getPermissionsForUser: jest.fn(async () => new Map(allFields.map((field) => [field.fieldCode, FieldPermissionMode.VISIBLE]))),
    } as unknown as FieldPermissionService;
    const service = new DispatchedOrderService(
      repoMock<DispatchedOrder>({ findOne: jest.fn(async () => order) }),
      repoMock<WorkOrder>(),
      repoMock<ModuleHandler>(),
      repoMock<UserRole>(),
      fieldConfigRepo,
      repoMock<Notification>(),
      repoMock<OperationLog>(),
      fieldPermissionService,
      { getLogs: jest.fn() } as unknown as FieldSupplementService,
      { exportSingleDispatchedOrder: jest.fn() } as never,
      validationServiceMock as never,
    );

    const result = await service.findOne(order.id, {
      sub: 'jiang-id', username: 'jianglu', roles: ['shared_leader'],
    } as JwtUserPayload);

    expect(result.fields.map((field) => field.fieldCode)).toEqual([
      'customer_name', 'customer_code', 'mobile', 'email', 'position', 'employee_name',
      'id_card_no', 'resignation_reason', 'resignation_date',
      'need_resignation_cert', 'cert_delivery_address', 'resignation_cert_status',
    ]);
    expect(result.fields.some((field) => field.fieldCode === 'social_insurance_result')).toBe(false);
    expect(result.visibleFields).toEqual(result.fields.map((field) => field.fieldCode));
  });

  it('uses active detail template fields despite hidden role permissions', async () => {
    const order = {
      ...makeDispatchedOrder(DispatchedOrderStatus.PENDING),
      moduleCode: DispatchModuleCode.RESIGNATION_CERT,
      visibleFields: ['employee_name', 'secret_note'],
      parentOrder: {
        ...makeDispatchedOrder().parentOrder,
        orderType: OrderType.RESIGNATION,
        extraData: {
          employee_name: '胡盛威',
          resignation_cert_format: '电子证明',
          secret_note: '不应显示',
        },
      },
    } as DispatchedOrder;
    const fields = [
      { fieldCode: 'employee_name', fieldName: '员工姓名', displayOrder: 1 },
      { fieldCode: 'resignation_cert_format', fieldName: '离职证明形式', displayOrder: 2 },
      { fieldCode: 'secret_note', fieldName: '内部备注', displayOrder: 3 },
    ].map((field) => ({
      ...field,
      fieldType: 'text',
      orderType: OrderType.RESIGNATION,
      businessContext: [OrderType.RESIGNATION],
      isActive: true,
      isRequired: false,
      defaultRequired: false,
    } as unknown as FieldConfig));
    const fieldPermissionService = {
      getPermissionsForUser: jest.fn(async () => new Map([
        ['employee_name', FieldPermissionMode.HIDDEN],
        ['resignation_cert_format', FieldPermissionMode.HIDDEN],
        ['secret_note', FieldPermissionMode.VISIBLE],
      ])),
    } as unknown as FieldPermissionService;
    const detailViewTemplatesService = {
      getActiveByModule: jest.fn(async () => ({
        moduleCode: DispatchModuleCode.RESIGNATION_CERT,
        businessScope: BusinessScope.BEILUN,
        fieldList: [
          { fieldCode: 'resignation_cert_format' },
          { fieldCode: 'employee_name' },
        ],
      })),
    };
    const service = new DispatchedOrderService(
      repoMock<DispatchedOrder>({ findOne: jest.fn(async () => order) }),
      repoMock<WorkOrder>(),
      repoMock<ModuleHandler>(),
      repoMock<UserRole>(),
      repoMock<FieldConfig>({ find: jest.fn(async () => fields) }),
      repoMock<Notification>(),
      repoMock<OperationLog>(),
      fieldPermissionService,
      { getLogs: jest.fn() } as unknown as FieldSupplementService,
      { exportSingleDispatchedOrder: jest.fn() } as never,
      validationServiceMock as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      detailViewTemplatesService as never,
    );

    const result = await service.findOne(order.id, {
      sub: 'jiang-id', username: 'jianglu', roles: ['shared_leader'],
    } as JwtUserPayload);

    expect(detailViewTemplatesService.getActiveByModule).toHaveBeenCalledWith(
      DispatchModuleCode.RESIGNATION_CERT,
      BusinessScope.BEILUN,
    );
    expect(result.fields.map((field) => field.fieldCode)).toEqual([
      'resignation_cert_format',
      'employee_name',
    ]);
    expect(result.fields.every((field) => field.permission === FieldPermissionMode.HIDDEN)).toBe(true);
    expect(result.visibleFields).toEqual(['resignation_cert_format', 'employee_name']);
    expect(result._detailTemplateFieldCodes).toEqual(['resignation_cert_format', 'employee_name']);
  });

  it('keeps an assigned province handler visible regardless of legacy module roles', async () => {
    const { service, queryBuilder } = makeService({
      find: jest.fn(async () => [
        { moduleCode: 'data_entry', handlerId: 'user-1', isActive: true } as unknown as ModuleHandler,
      ]),
    }, []);
    const user: JwtUserPayload = {
      sub: 'user-1',
      username: 'processor01',
      roles: ['data_entry_team'],
    } as JwtUserPayload;

    await service.findAll({
      page: 1,
      pageSize: 20,
      businessScope: BusinessScope.OUT_OF_PROVINCE,
    }, user);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'w.business_scope = :businessScope',
      { businessScope: BusinessScope.OUT_OF_PROVINCE },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'd.handler_id = :userId',
      { userId: 'user-1' },
    );
    expect((queryBuilder.andWhere.mock.calls as Array<[unknown]>).some(
      ([condition]) => typeof condition === 'object' && condition?.constructor?.name === 'Brackets',
    )).toBe(false);
  });

  it('allows only Yang Chun, Jiang Lu, or admins to read resignation certificate child details', async () => {
    const { service } = makeService();
    const assertCanRead = (service as unknown as {
      assertCanRead: (order: DispatchedOrder, user: JwtUserPayload) => Promise<void>;
    }).assertCanRead.bind(service);
    const order = {
      ...makeDispatchedOrder(),
      moduleCode: 'resignation_cert',
      handlerId: 'social-id',
      parentOrder: { ...makeDispatchedOrder().parentOrder, createdBy: 'social-id' },
    } as DispatchedOrder;

    await expect(assertCanRead(order, {
      sub: 'social-id',
      username: 'fuqianwen',
      realName: '傅倩雯',
      roles: ['social_insurance_specialist'],
    } as JwtUserPayload)).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });

    await expect(assertCanRead(order, {
      sub: 'yang-id', username: 'yangchun', realName: '杨纯', roles: ['contract_specialist'],
    } as JwtUserPayload)).resolves.toBeUndefined();
    await expect(assertCanRead(order, {
      sub: 'jiang-id', username: 'jianglu', realName: '江璐', roles: ['shared_leader'],
    } as JwtUserPayload)).resolves.toBeUndefined();
    await expect(assertCanRead(order, {
      sub: 'admin-id', username: 'admin', roles: ['admin'],
    } as JwtUserPayload)).resolves.toBeUndefined();
  });

  it('scopes business owner/leader child-order history by department range', async () => {
    const { service, queryBuilder } = makeService({
      find: jest.fn(async () => []),
    });
    const user: JwtUserPayload = { sub: 'owner-1', username: 'owner', roles: ['business_group_leader'] } as JwtUserPayload;

    await service.findAll({ page: 1, pageSize: 20 } as never, user);

    const scopeCallback = (queryBuilder.andWhere.mock.calls as Array<[unknown, unknown?]>)
      .map(([condition]) => condition)
      .find((condition) => typeof condition === 'object' && condition && condition.constructor?.name === 'Brackets');
    expect(scopeCallback).toBeDefined();
    const scopeQb = { where: jest.fn(), orWhere: jest.fn() };
    (scopeCallback as { whereFactory: (qb: typeof scopeQb) => void }).whereFactory(scopeQb);

    expect(scopeQb.where).toHaveBeenCalledWith('w.department_id IN (:...businessScopeDepartmentIds)', { businessScopeDepartmentIds: ['d1'] });
    expect(scopeQb.orWhere).toHaveBeenCalledWith('w.created_by = :userId', { userId: 'owner-1' });
    expect(scopeQb.orWhere).not.toHaveBeenCalledWith('d.module_code IN (:...modules)', expect.anything());
  });

  it('scopes business member child-order history to own created orders only', async () => {
    const { service, queryBuilder } = makeService({
      find: jest.fn(async () => [
        { moduleCode: 'data_entry', handlerId: 'sales-1', isActive: true } as unknown as ModuleHandler,
      ]),
    });
    const user: JwtUserPayload = { sub: 'sales-1', username: 'sales', roles: ['business_group_member'] } as JwtUserPayload;

    await service.findAll({ page: 1, pageSize: 20 } as never, user);


    const scopeCallback = (queryBuilder.andWhere.mock.calls as Array<[unknown, unknown?]>)
      .map(([condition]) => condition)
      .find((condition) => typeof condition === 'object' && condition && condition.constructor?.name === 'Brackets');
    expect(scopeCallback).toBeDefined();
    const scopeQb = { where: jest.fn(), orWhere: jest.fn() };
    (scopeCallback as { whereFactory: (qb: typeof scopeQb) => void }).whereFactory(scopeQb);

    expect(scopeQb.where).toHaveBeenCalledWith('w.created_by = :userId', { userId: 'sales-1' });
    expect(scopeQb.orWhere).not.toHaveBeenCalledWith('d.module_code IN (:...modules)', expect.anything());
  });

  it('does not leak unrelated creator child modules for Jiang Lu shared backend list scope', async () => {
    const { service, queryBuilder } = makeService({
      find: jest.fn(async () => [
        { moduleCode: 'contract', handlerId: 'jianglu', isActive: true } as unknown as ModuleHandler,
        { moduleCode: 'onboarding_contact', handlerId: 'jianglu', isActive: true } as unknown as ModuleHandler,
        { moduleCode: 'resignation_contact', handlerId: 'jianglu', isActive: true } as unknown as ModuleHandler,
        { moduleCode: 'social_insurance', handlerId: 'jianglu', isActive: true } as unknown as ModuleHandler,
      ]),
    });
    const user: JwtUserPayload = { sub: 'jianglu', username: 'jianglu', roles: ['shared_leader', 'contract_specialist', 'onboarding_specialist'] } as JwtUserPayload;

    await service.findAll({ page: 1, pageSize: 20 } as never, user);

    const scopeCallback = (queryBuilder.andWhere.mock.calls as Array<[unknown, unknown?]>)
      .map(([condition]) => condition)
      .find((condition) => typeof condition === 'object' && condition && condition.constructor?.name === 'Brackets');
    expect(scopeCallback).toBeDefined();
    const scopeQb = { where: jest.fn(), orWhere: jest.fn() };
    (scopeCallback as { whereFactory: (qb: typeof scopeQb) => void }).whereFactory(scopeQb);

    expect(scopeQb.where).toHaveBeenCalledWith('d.handler_id = :userId AND d.module_code IN (:...modules)', { userId: 'jianglu', modules: ['contract', 'onboarding_contact', 'resignation_contact'] });
    expect(scopeQb.orWhere).not.toHaveBeenCalledWith('w.created_by = :userId', { userId: 'jianglu' });
    expect(scopeQb.orWhere).toHaveBeenCalledWith('d.module_code IN (:...modules)', { modules: ['contract', 'onboarding_contact', 'resignation_contact'] });
  });

  it('shares all contract child orders with contract team members while keeping other modules scoped', async () => {
    const { service, queryBuilder } = makeService({
      find: jest.fn(async () => [
        { moduleCode: 'contract', handlerId: 'hujiayi', isActive: true } as unknown as ModuleHandler,
        { moduleCode: 'data_entry', handlerId: 'hujiayi', isActive: true } as unknown as ModuleHandler,
      ]),
    });
    const user: JwtUserPayload = {
      sub: 'hujiayi',
      username: 'hujiayi',
      roles: ['contract_specialist', 'data_entry_team'],
    } as JwtUserPayload;

    await service.findAll({ page: 1, pageSize: 20, moduleCode: 'contract' } as never, user);

    const scopeCallback = (queryBuilder.andWhere.mock.calls as Array<[unknown, unknown?]>)
      .map(([condition]) => condition)
      .find((condition) => typeof condition === 'object' && condition && condition.constructor?.name === 'Brackets');
    expect(scopeCallback).toBeDefined();
    const scopeQb = { where: jest.fn(), orWhere: jest.fn() };
    (scopeCallback as { whereFactory: (qb: typeof scopeQb) => void }).whereFactory(scopeQb);

    expect(scopeQb.where).toHaveBeenCalledWith(
      'd.handler_id = :userId AND d.module_code IN (:...modules)',
      { userId: 'hujiayi', modules: ['contract', 'data_entry', 'data_entry_resign'] },
    );
    expect(scopeQb.orWhere).toHaveBeenCalledWith(
      'd.module_code IN (:...teamVisibleModules)',
      { teamVisibleModules: ['contract'] },
    );
    expect(scopeQb.orWhere).toHaveBeenCalledWith(
      'd.handler_id IS NULL AND d.module_code IN (:...poolModules)',
      { poolModules: ['data_entry', 'data_entry_resign'] },
    );
  });

  it('keeps backend assigned scope inside role allow-list even when stale social handler rows point to the user', async () => {
    const socialOrder = {
      ...makeDispatchedOrder(DispatchedOrderStatus.PROCESSING),
      moduleCode: 'social_insurance',
      handlerId: 'jianglu',
      parentOrder: { ...makeDispatchedOrder().parentOrder, createdBy: 'sales-2' },
    } as DispatchedOrder;
    const dispatchedOrderRepo = repoMock<DispatchedOrder>({ findOne: jest.fn(async () => socialOrder) });
    const service = new DispatchedOrderService(
      dispatchedOrderRepo,
      repoMock<WorkOrder>(),
      repoMock<ModuleHandler>({ count: jest.fn(async () => 1), find: jest.fn(async () => [{ moduleCode: 'social_insurance', handlerId: 'jianglu', isActive: true } as unknown as ModuleHandler]) }),
      repoMock<UserRole>(),
      repoMock<FieldConfig>(),
      repoMock<Notification>(),
      repoMock<OperationLog>(),
      {} as FieldPermissionService,
      { getLogs: jest.fn() } as unknown as FieldSupplementService,
      { exportSingleDispatchedOrder: jest.fn() } as never,
      validationServiceMock as never,
      undefined,
      undefined,
      undefined,
      undefined,
      repoMock(),
    );

    await expect(service.findOne('do-processing', { sub: 'jianglu', username: 'jianglu', roles: ['shared_leader', 'contract_specialist', 'onboarding_specialist'] } as JwtUserPayload))
      .rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
  });

  it('maps Chinese moduleName and nodeType filters to module_code', async () => {
    const { service, queryBuilder } = makeService({
      find: jest.fn(async () => [{ moduleCode: 'onboarding_contact', handlerId: 'user-1', isActive: true } as unknown as ModuleHandler]),
    });
    const user: JwtUserPayload = { sub: 'user-1', username: 'processor01', roles: ['shared_team_owner'] } as JwtUserPayload;

    await service.findAll({ page: 1, pageSize: 20, moduleName: '入职联系' } as never, user);
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('d.module_code = :moduleCode'), { moduleCode: 'onboarding_contact' });

    queryBuilder.andWhere.mockClear();
    await service.findAll({ page: 1, pageSize: 20, nodeType: '劳动合同签订' } as never, user);
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('d.module_code = :moduleCode'), { moduleCode: 'contract' });
  });

  it('applies multi-status and compatible header filter fields before pagination', async () => {
    const { service, queryBuilder } = makeService();
    const user: JwtUserPayload = { sub: 'user-1', username: 'processor01', roles: ['data_entry_team'] } as JwtUserPayload;

    await service.findAll({
      page: 2,
      pageSize: 10,
      statuses: 'pending,processing,invalid',
      assignee: ['handler-1', 'handler-2'],
      department: 'dep-1,dep-2',
      type: ['onboarding', 'renewal'],
      employee_id_card: '3301',
      customerName: 'Acme',
      employee_name: 'Alice',
    } as never, user);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('d.status IN'), { statuses: [DispatchedOrderStatus.PENDING, DispatchedOrderStatus.PROCESSING] });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('d.handler_id IN'), { handlerId: ['handler-1', 'handler-2'] });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('w.department_id IN'), { departmentIds: ['dep-1', 'dep-2'] });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('w.order_type IN'), { orderTypes: ['onboarding', 'renewal'] });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('employee_id_card'), { idCardNo: '%3301%' });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('customerName'), { customerName: '%Acme%' });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('employeeName'), { employeeName: '%Alice%' });
    expect(queryBuilder.offset).toHaveBeenCalledWith(10);
    expect(queryBuilder.limit).toHaveBeenCalledWith(10);
  });

  it('batch accepts selected pending child orders and reports skipped rows', async () => {
    const { service } = makeService();
    const user: JwtUserPayload = { sub: 'user-1', username: 'processor01', roles: ['data_entry_team'] } as JwtUserPayload;
    jest.spyOn(service, 'accept')
      .mockResolvedValueOnce({ id: '11111111-1111-4111-8111-111111111111' } as never)
      .mockRejectedValueOnce(new Error('not pending'));

    const result = await service.batchAccept({ ids: [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111',
    ] }, user);

    expect(service.accept).toHaveBeenCalledTimes(2);
    expect(result.accepted).toBe(1);
    expect(result.skipped).toEqual([{ id: '22222222-2222-4222-8222-222222222222', reason: 'not pending' }]);
  });

  it('accepts repeated status query arrays through the global validation pipe contract', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

    await expect(pipe.transform({ status: ['processing', 'completed'] }, { type: 'query', metatype: ListDispatchedOrderQueryDto, data: '' }))
      .resolves.toEqual(expect.objectContaining({ status: ['processing', 'completed'] }));
    await expect(pipe.transform({ statuses: ['processing', 'completed'] }, { type: 'query', metatype: ListDispatchedOrderQueryDto, data: '' }))
      .resolves.toEqual(expect.objectContaining({ statuses: ['processing', 'completed'] }));
    await expect(pipe.transform({ statusIn: ['processing', 'completed'] }, { type: 'query', metatype: ListDispatchedOrderQueryDto, data: '' }))
      .resolves.toEqual(expect.objectContaining({ statusIn: ['processing', 'completed'] }));
    await expect(pipe.transform({ statuses: 'processing,completed' }, { type: 'query', metatype: ListDispatchedOrderQueryDto, data: '' }))
      .resolves.toEqual(expect.objectContaining({ statuses: ['processing', 'completed'] }));
    await expect(pipe.transform({ dataEntryStatuses: 'processing,completed' }, { type: 'query', metatype: ListDispatchedOrderQueryDto, data: '' }))
      .resolves.toEqual(expect.objectContaining({ dataEntryStatuses: ['processing', 'completed'] }));
  });

  it('accepts dashboard fallback scope query through the global validation pipe contract', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

    await expect(pipe.transform(
      { scope: 'team', page: '1', pageSize: '100' },
      { type: 'query', metatype: ListDispatchedOrderQueryDto, data: '' },
    )).resolves.toEqual(expect.objectContaining({ scope: 'team', page: 1, pageSize: 100 }));
  });

  it('applies status/statuses/statusIn single processing filters and returns processing rows', async () => {
    const user: JwtUserPayload = { sub: 'user-1', username: 'processor01', roles: ['data_entry_team'] } as JwtUserPayload;
    const processingOrder = makeDispatchedOrder(DispatchedOrderStatus.PROCESSING);
    const cases: Array<Record<string, string>> = [
      { status: 'processing' },
      { statuses: 'processing' },
      { statusIn: 'processing' },
    ];

    for (const query of cases) {
      const { service, queryBuilder } = makeService({}, [processingOrder]);
      const result = await service.findAll({ page: 1, pageSize: 20, ...query } as never, user);
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('d.status = :status'), { status: DispatchedOrderStatus.PROCESSING });
      expect(result.total).toBe(1);
      expect(result.items[0].status).toBe(DispatchedOrderStatus.PROCESSING);
    }
  });

  it('applies status/statuses/statusIn array and comma forms to the same status IN filter', async () => {
    const user: JwtUserPayload = { sub: 'user-1', username: 'processor01', roles: ['data_entry_team'] } as JwtUserPayload;
    const cases: Array<Partial<ListDispatchedOrderQueryDto>> = [
      { status: ['processing', 'completed'] },
      { statuses: ['processing', 'completed'] },
      { statusIn: ['processing', 'completed'] },
      { status: ['processing,completed'] },
      { statuses: 'processing,completed' },
      { statusIn: 'processing,completed' },
    ];

    for (const query of cases) {
      const { service, queryBuilder } = makeService({}, [makeDispatchedOrder(DispatchedOrderStatus.PROCESSING)]);
      const result = await service.findAll({ page: 1, pageSize: 20, ...query } as never, user);
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('d.status IN'), { statuses: [DispatchedOrderStatus.PROCESSING, DispatchedOrderStatus.COMPLETED] });
      expect(result.items[0].status).toBe(DispatchedOrderStatus.PROCESSING);
    }
  });

  it('normalizes Chinese processing label to pending and processing filters', async () => {
    const user: JwtUserPayload = { sub: 'user-1', username: 'processor01', roles: ['data_entry_team'] } as JwtUserPayload;
    const cases: Array<Record<string, string | string[]>> = [
      { status: '处理中' },
      { statuses: ['处理中'] },
      { statusIn: '處理中' },
      { statuses: '处理中,in_progress,processing' },
    ];

    for (const query of cases) {
      const { service, queryBuilder } = makeService({}, [makeDispatchedOrder(DispatchedOrderStatus.PENDING), makeDispatchedOrder(DispatchedOrderStatus.PROCESSING)]);
      const result = await service.findAll({ page: 1, pageSize: 20, ...query } as never, user);
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('d.status IN'), { statuses: [DispatchedOrderStatus.PENDING, DispatchedOrderStatus.PROCESSING] });
      expect(result.items.map((item) => item.status)).toEqual([DispatchedOrderStatus.PENDING, DispatchedOrderStatus.PROCESSING]);
    }
  });

  it('normalizes legacy English processing aliases to processing filters', async () => {
    const user: JwtUserPayload = { sub: 'user-1', username: 'processor01', roles: ['data_entry_team'] } as JwtUserPayload;
    const cases: Array<Record<string, string | string[]>> = [
      { statuses: ['accepted'] },
      { statusIn: 'in_progress' },
      { status: 'handling' },
    ];

    for (const query of cases) {
      const { service, queryBuilder } = makeService({}, [makeDispatchedOrder(DispatchedOrderStatus.PROCESSING)]);
      const result = await service.findAll({ page: 1, pageSize: 20, ...query } as never, user);
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('d.status = :status'), { status: DispatchedOrderStatus.PROCESSING });
      expect(result.items[0].status).toBe(DispatchedOrderStatus.PROCESSING);
    }
  });

  it('limits batch complete ids to 50 items', () => {
    const dto = Object.assign(new BatchCompleteDispatchedOrderDto(), {
      ids: Array.from({ length: 51 }, (_item, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`),
      remark: 'done',
    });

    expect(validateSync(dto).some((error) => error.property === 'ids')).toBe(true);
  });

  it('exports one resignation certificate as a filled Word document', async () => {
    const { service } = makeService();
    const order = {
      ...makeDispatchedOrder(),
      id: 'cert-1',
      moduleCode: 'resignation_cert',
      parentOrder: {
        ...makeDispatchedOrder().parentOrder,
        orderNo: 'RS-001',
        employeeName: '张三',
      },
    } as DispatchedOrder;
    const uploadsService = {
      save: jest.fn(async (input: { originalName: string; mimeType: string; buffer: Buffer }) => ({
        fileId: 'word-1',
        originalName: input.originalName,
        mimeType: input.mimeType,
        size: input.buffer.length,
      })),
    };
    Object.defineProperty(service, 'uploadsService', { value: uploadsService });
    jest.spyOn(service as never, 'loadDispatchedOrder' as never).mockResolvedValue(order as never);
    jest.spyOn(service as never, 'assertCanRead' as never).mockResolvedValue(undefined as never);
    jest.spyOn(service as never, 'createResignationCertificateDocument' as never).mockResolvedValue({
      buffer: Buffer.from('filled-docx'),
      fileName: '离职证明-RS-001.docx',
      replacements: {},
    } as never);
    jest.spyOn(service as never, 'writeLog' as never).mockResolvedValue(undefined as never);

    const result = await service.batchExport(
      { ids: ['cert-1'] },
      { sub: 'handler-1', username: 'handler', roles: ['labor_contract_member'] } as JwtUserPayload,
    );

    expect(result.files).toEqual([
      expect.objectContaining({
        fileId: 'word-1',
        fileName: '离职证明-RS-001.docx',
        fileType: 'word',
        moduleCode: 'resignation_cert',
      }),
    ]);
    expect(uploadsService.save).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'attachment',
      originalName: '离职证明-RS-001.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('filled-docx'),
    }));
    expect((service as never as { exportTemplatesService: { exportDispatchedOrdersAuto: jest.Mock } })
      .exportTemplatesService.exportDispatchedOrdersAuto).not.toHaveBeenCalled();
  });

  it('exports multiple resignation certificates as a ZIP containing only filled Word documents', async () => {
    const { service } = makeService();
    const orders = [
      {
        ...makeDispatchedOrder(),
        id: 'cert-1',
        moduleCode: 'resignation_cert',
        parentOrder: {
          ...makeDispatchedOrder().parentOrder,
          orderNo: 'RS-001',
          employeeName: '张三',
        },
      },
      {
        ...makeDispatchedOrder(),
        id: 'cert-2',
        moduleCode: 'resignation_cert',
        parentOrder: {
          ...makeDispatchedOrder().parentOrder,
          orderNo: 'RS-002',
          employeeName: '李四',
        },
      },
    ] as DispatchedOrder[];
    let savedBuffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    const uploadsService = {
      save: jest.fn(async (input: { originalName: string; mimeType: string; buffer: Buffer }) => {
        savedBuffer = input.buffer;
        return {
          fileId: 'word-zip-1',
          originalName: input.originalName,
          mimeType: input.mimeType,
          size: input.buffer.length,
        };
      }),
    };
    Object.defineProperty(service, 'uploadsService', { value: uploadsService });
    jest.spyOn(service as any, 'loadDispatchedOrder')
      .mockImplementation(async (...args: unknown[]) => orders.find((order) => order.id === String(args[0])));
    jest.spyOn(service as any, 'assertCanRead').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'createResignationCertificateDocument')
      .mockImplementation(async (...args: unknown[]) => {
        const order = args[0] as DispatchedOrder;
        return {
          buffer: Buffer.from(`filled-${order.id}`),
          fileName: `离职证明-${order.parentOrder.orderNo}.docx`,
          replacements: {},
        };
      });
    jest.spyOn(service as any, 'writeLog').mockResolvedValue(undefined);

    const result = await service.batchExport(
      { ids: ['cert-1', 'cert-2'] },
      { sub: 'handler-1', username: 'handler', roles: ['labor_contract_member'] } as JwtUserPayload,
    );

    expect(result.files).toEqual([
      expect.objectContaining({
        fileId: 'word-zip-1',
        fileName: '离职证明-2人.zip',
        fileType: 'word_zip',
        count: 2,
      }),
    ]);
    const zip = await JSZip.loadAsync(savedBuffer);
    expect(zip.file('离职证明-张三-RS-001.docx')).toBeTruthy();
    expect(zip.file('离职证明-李四-RS-002.docx')).toBeTruthy();
    expect(Object.keys(zip.files)).toHaveLength(2);
  });

  it('forbids deleting a dispatched order directly', async () => {
    const dispatchedOrderRepo = repoMock<DispatchedOrder>();
    const workOrderRepo = repoMock<WorkOrder>();
    const moduleHandlerRepo = repoMock<ModuleHandler>();
    const userRoleRepo = repoMock<UserRole>();
    const fieldConfigRepo = repoMock<FieldConfig>();
    const notificationRepo = repoMock<Notification>();
    const operationLogRepo = repoMock<OperationLog>();
    const fieldPermissionService = { getPermissionsForUser: jest.fn(), applyExtraData: jest.fn(), applyFieldViews: jest.fn() } as unknown as FieldPermissionService;
    const fieldSupplementService = { supplement: jest.fn(), getLogs: jest.fn() } as unknown as FieldSupplementService;
    const exportTemplatesService = { exportSingleDispatchedOrder: jest.fn() };
    const service = new DispatchedOrderService(dispatchedOrderRepo, workOrderRepo, moduleHandlerRepo, userRoleRepo, fieldConfigRepo, notificationRepo, operationLogRepo, fieldPermissionService, fieldSupplementService, exportTemplatesService as never, validationServiceMock as never);

    await expect(service.remove('do-1', { sub: 'admin-1', username: 'admin', roles: ['admin'] } as JwtUserPayload)).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    expect(dispatchedOrderRepo.delete).not.toHaveBeenCalled();
    expect(operationLogRepo.save).not.toHaveBeenCalled();
  });

  it('forbids batch deleting dispatched orders directly', async () => {
    const dispatchedOrderRepo = repoMock<DispatchedOrder>();
    const service = new DispatchedOrderService(dispatchedOrderRepo, repoMock<WorkOrder>(), repoMock<ModuleHandler>(), repoMock<UserRole>(), repoMock<FieldConfig>(), repoMock<Notification>(), repoMock<OperationLog>(), {} as FieldPermissionService, { getLogs: jest.fn() } as unknown as FieldSupplementService, { exportSingleDispatchedOrder: jest.fn() } as never, validationServiceMock as never);

    await expect(service.batchRemove(['do-1'], { sub: 'admin-1', username: 'admin', roles: ['admin'] } as JwtUserPayload)).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    expect(dispatchedOrderRepo.delete).not.toHaveBeenCalled();
  });

  it.each(['data_entry', 'onboarding_contact', 'contract', 'renewal_contract', 'resignation_contact', 'resignation_cert', 'benefit_apply'])(
    'lists %s module without throwing and applies module filter',
    async (moduleCode) => {
      const { service, queryBuilder } = makeService({
        find: jest.fn(async () => [{ moduleCode, handlerId: 'user-1', isActive: true } as unknown as ModuleHandler]),
      });
      const user: JwtUserPayload = { sub: 'user-1', username: 'processor01', roles: [`${moduleCode}_team`] } as JwtUserPayload;

      await expect(service.findAll({ page: 1, pageSize: 20, moduleCode } as never, user)).resolves.toMatchObject({ total: 1 });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('d.module_code = :moduleCode'), { moduleCode });
      if (['payroll_bank_card', 'resignation_cert'].includes(moduleCode)) {
        expect(queryBuilder.andWhere).toHaveBeenCalledWith(
          expect.stringContaining('d.module_code IN (:...phase1Modules)'),
          { phase1Modules: expect.arrayContaining([moduleCode]) },
        );
      }
    },
  );

  it('uses concrete actor name in field-change notifications for dispatched recipients', async () => {
    const parentOrder = { id: 'wo-1', orderNo: 'ON20260511001', modificationRound: 0 } as unknown as WorkOrder;
    const sourceOrder = { id: 'do-source', parentOrderId: 'wo-1', parentOrder, moduleCode: 'data_entry' } as unknown as DispatchedOrder;
    const child = {
      id: 'do-target',
      parentOrderId: 'wo-1',
      parentOrder,
      moduleCode: 'data_entry',
      status: DispatchedOrderStatus.PENDING,
      handlerId: 'recipient-1',
      visibleFields: ['employee_name'],
      voidAt: null,
    } as unknown as DispatchedOrder;
    const dispatchedOrderRepo = repoMock<DispatchedOrder>({ find: jest.fn(async () => [child]) });
    const workOrderRepo = repoMock<WorkOrder>({
      manager: {
        getRepository: jest.fn(() => ({ findOne: jest.fn(async () => ({ id: 'actor-1', realName: '张三', username: 'zhangsan' } as User)) })),
      },
    });
    const notificationRepo = repoMock<Notification>();
    const dirtyMarkRepo = repoMock<WorkOrderFieldDirtyMark>();
    const service = new DispatchedOrderService(
      dispatchedOrderRepo,
      workOrderRepo,
      repoMock<ModuleHandler>(),
      repoMock<UserRole>(),
      repoMock<FieldConfig>({ find: jest.fn(async () => [{ fieldCode: 'employee_name', fieldName: '员工姓名' }]) }),
      notificationRepo,
      repoMock<OperationLog>(),
      {} as FieldPermissionService,
      { getLogs: jest.fn() } as unknown as FieldSupplementService,
      { exportSingleDispatchedOrder: jest.fn() } as never,
      validationServiceMock as never,
      undefined,
      undefined,
      dirtyMarkRepo,
      repoMock<ModuleField>({ find: jest.fn(async () => []) }),
    );

    await (service as unknown as {
      markAndNotifyAffectedDispatchedOrders: (order: DispatchedOrder, diff: Array<{ field: string; before: unknown; after: unknown }>, actorUserId: string, bizType: string) => Promise<void>;
    }).markAndNotifyAffectedDispatchedOrders(sourceOrder, [{ field: 'employee_name', before: '李四', after: '王五' }], 'actor-1', 'order.field_changed');

    expect(notificationRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'recipient-1',
      content: expect.stringContaining('张三'),
    }));
    expect(notificationRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.not.stringContaining('办理人'),
    }));
  });

  it('rejects payroll bank card status-result import before row processing', async () => {
    const { service } = makeService();

    await expect(service.batchImport({
      moduleCode: 'payroll_bank_card',
      mode: 'status',
      forceAction: 'complete',
      rows: [{ orderNo: 'ON20260511001' }],
    }, { sub: 'admin-1', username: 'admin', roles: ['admin'] } as JwtUserPayload)).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      message: '薪酬银行卡导出清单不支持导入',
    });
  });

  it('requires standardized batch import action and rejects business-side imports before row processing', async () => {
    const { service } = makeService();
    const businessUser = { sub: 'biz-1', username: 'sales', roles: ['business_group_member'] } as JwtUserPayload;

    await expect(service.batchImport({
      moduleCode: 'contract',
      mode: 'status',
      rows: [{ orderNo: 'ON20260511001', result: '完成' }],
    }, businessUser)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });

    await expect(service.batchImport({
      moduleCode: 'contract',
      mode: 'status',
      forceAction: 'complete',
      rows: [{ orderNo: 'ON20260511001' }],
    }, businessUser)).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
  });

  it('matches exported template rows using short identity aliases and normalized headers', async () => {
    const order = makeDispatchedOrder(DispatchedOrderStatus.PENDING);
    const qb = {
      leftJoinAndSelect: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      orderBy: jest.fn(),
      getMany: jest.fn(async () => [order]),
      update: jest.fn(),
      set: jest.fn(),
      execute: jest.fn(),
    };
    qb.leftJoinAndSelect.mockReturnValue(qb);
    qb.where.mockReturnValue(qb);
    qb.andWhere.mockReturnValue(qb);
    qb.orderBy.mockReturnValue(qb);
    const dispatchedOrderRepo = repoMock<DispatchedOrder>({ createQueryBuilder: jest.fn(() => qb), save: jest.fn(async (input) => input) });
    const service = new DispatchedOrderService(
      dispatchedOrderRepo,
      repoMock<WorkOrder>(),
      repoMock<ModuleHandler>({ count: jest.fn(async () => 1) }),
      repoMock<UserRole>(),
      repoMock<FieldConfig>(),
      repoMock<Notification>(),
      repoMock<OperationLog>(),
      {} as FieldPermissionService,
      { getLogs: jest.fn() } as unknown as FieldSupplementService,
      { exportSingleDispatchedOrder: jest.fn() } as never,
      validationServiceMock as never,
    );

    await service.batchImport({
      moduleCode: '数据录入',
      mode: 'status',
      forceAction: 'complete',
      rows: [{ raw: { 编号: order.parentOrder.orderNo, '\ufeff 证件号 ': order.parentOrder.employeeIdCard } }],
      defaultRemark: 'done',
    }, { sub: 'user-1', username: 'processor01', roles: ['data_entry_team'] } as JwtUserPayload);

    expect(qb.where).toHaveBeenCalledWith('d.module_code = :moduleCode', { moduleCode: 'data_entry' });
    expect(qb.andWhere).toHaveBeenCalledWith('w.order_no = :orderNo', { orderNo: order.parentOrder.orderNo });
    expect(qb.andWhere).toHaveBeenCalledWith(
      "(w.employee_id_card = :employeeIdCard OR w.extra_data->>'id_card_no' = :employeeIdCard OR w.extra_data->>'employee_id_card' = :employeeIdCard OR w.extra_data->>'employeeIdCard' = :employeeIdCard OR w.extra_data->>'idCardNo' = :employeeIdCard)",
      { employeeIdCard: order.parentOrder.employeeIdCard },
    );
    expect(qb.orderBy).toHaveBeenCalledWith('d.created_at', 'DESC');
  });

  it('reports voided child rows clearly during batch import complete', async () => {
    const order = makeDispatchedOrder(DispatchedOrderStatus.VOID);
    order.voidAt = new Date('2026-06-04T00:00:00.000Z');
    const qb = {
      leftJoinAndSelect: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      orderBy: jest.fn(),
      getMany: jest.fn(async () => [order]),
    };
    qb.leftJoinAndSelect.mockReturnValue(qb);
    qb.where.mockReturnValue(qb);
    qb.andWhere.mockReturnValue(qb);
    qb.orderBy.mockReturnValue(qb);
    const dispatchedOrderRepo = repoMock<DispatchedOrder>({ createQueryBuilder: jest.fn(() => qb), save: jest.fn(async (input) => input) });
    const service = new DispatchedOrderService(
      dispatchedOrderRepo,
      repoMock<WorkOrder>(),
      repoMock<ModuleHandler>({ count: jest.fn(async () => 1) }),
      repoMock<UserRole>(),
      repoMock<FieldConfig>(),
      repoMock<Notification>(),
      repoMock<OperationLog>(),
      {} as FieldPermissionService,
      { getLogs: jest.fn() } as unknown as FieldSupplementService,
      { exportSingleDispatchedOrder: jest.fn() } as never,
      validationServiceMock as never,
    );

    const result = await service.batchImport({
      moduleCode: '数据录入',
      mode: 'status',
      forceAction: 'complete',
      rows: [{ orderNo: order.parentOrder.orderNo }],
      defaultRemark: 'done',
    }, { sub: 'user-1', username: 'processor01', roles: ['data_entry_team'] } as JwtUserPayload);

    expect(result.successRows).toBe(0);
    expect(result.failRows).toBe(1);
    expect(result.rows[0].message).toBe('该子工单已作废，不能批量导入办理完成');
    expect(dispatchedOrderRepo.save).not.toHaveBeenCalled();
  });

  it('rejects accept/claim/complete/return when parent work order is void, void_pending, withdraw_pending, withdrawn, or child has voidAt', async () => {
    const makeParent = (status: WorkOrderStatus) => ({
      id: 'wo-1',
      orderNo: 'ON20260511001',
      orderType: OrderType.ONBOARDING,
      status,
      createdBy: 'u1',
      departmentId: 'd1',
      customerId: 'c1',
      employeeName: 'employee',
      employeeIdCard: '330102199001010011',
      extraData: {},
      submittedAt: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as WorkOrder);
    const makeOrder = (status: DispatchedOrderStatus, parentStatus: WorkOrderStatus, overrides: Partial<DispatchedOrder> = {}) => ({
      id: 'do-1',
      parentOrderId: 'wo-1',
      parentOrder: makeParent(parentStatus),
      moduleCode: 'data_entry',
      status,
      handlerId: 'handler-1',
      visibleFields: ['employee_name'],
      returnReason: null,
      dispatchedAt: new Date(),
      acceptedAt: status === DispatchedOrderStatus.PROCESSING ? new Date() : null,
      completedAt: null,
      voidAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as unknown as DispatchedOrder);
    const dispatchedOrderRepo = repoMock<DispatchedOrder>();
    const service = new DispatchedOrderService(
      dispatchedOrderRepo,
      repoMock<WorkOrder>(),
      repoMock<ModuleHandler>(),
      repoMock<UserRole>(),
      repoMock<FieldConfig>(),
      repoMock<Notification>(),
      repoMock<OperationLog>(),
      {} as FieldPermissionService,
      { getLogs: jest.fn() } as unknown as FieldSupplementService,
      { exportSingleDispatchedOrder: jest.fn() } as never,
      validationServiceMock as never,
    );
    const user = { sub: 'handler-1', username: 'handler', roles: ['data_entry_team'] } as JwtUserPayload;

    (dispatchedOrderRepo.findOne as jest.Mock).mockResolvedValueOnce(makeOrder(DispatchedOrderStatus.PENDING, WorkOrderStatus.VOID));
    await expect(service.accept('do-1', {}, user)).rejects.toMatchObject({ status: HttpStatus.CONFLICT });

    (dispatchedOrderRepo.findOne as jest.Mock).mockResolvedValueOnce(makeOrder(DispatchedOrderStatus.PENDING, WorkOrderStatus.VOID_PENDING, { handlerId: null }));
    await expect(service.claim('do-1', user)).rejects.toMatchObject({ status: HttpStatus.CONFLICT });

    (dispatchedOrderRepo.findOne as jest.Mock).mockResolvedValueOnce(makeOrder(DispatchedOrderStatus.PROCESSING, WorkOrderStatus.WITHDRAW_PENDING));
    await expect(service.complete('do-1', { remark: 'done' }, user)).rejects.toMatchObject({ status: HttpStatus.CONFLICT });

    (dispatchedOrderRepo.findOne as jest.Mock).mockResolvedValueOnce(makeOrder(DispatchedOrderStatus.PROCESSING, WorkOrderStatus.WITHDRAWN));
    await expect(service.returnOrder('do-1', { returnReason: 'bad' }, user)).rejects.toMatchObject({ status: HttpStatus.CONFLICT });

    (dispatchedOrderRepo.findOne as jest.Mock).mockResolvedValueOnce(makeOrder(DispatchedOrderStatus.PROCESSING, WorkOrderStatus.PROCESSING, { voidAt: new Date() }));
    await expect(service.complete('do-1', { remark: 'done' }, user)).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    expect(dispatchedOrderRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('returnOrder rejects with 409 and writes nothing to parent/child when parent work order is withdrawn', async () => {
    const parentOrder = {
      id: 'wo-1',
      orderNo: 'ON20260511001',
      orderType: OrderType.ONBOARDING,
      status: WorkOrderStatus.WITHDRAWN,
      createdBy: 'u1',
      departmentId: 'd1',
      customerId: 'c1',
      employeeName: 'employee',
      employeeIdCard: '330102199001010011',
      extraData: {},
      submittedAt: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as WorkOrder;
    const order = {
      id: 'do-1',
      parentOrderId: 'wo-1',
      parentOrder,
      moduleCode: 'data_entry',
      status: DispatchedOrderStatus.PROCESSING,
      handlerId: 'handler-1',
      visibleFields: ['employee_name'],
      returnReason: null,
      dispatchedAt: new Date(),
      acceptedAt: new Date(),
      completedAt: null,
      voidAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as DispatchedOrder;
    const dispatchedOrderRepo = repoMock<DispatchedOrder>({ findOne: jest.fn(async () => order) });
    const workOrderRepo = repoMock<WorkOrder>();
    const service = new DispatchedOrderService(
      dispatchedOrderRepo,
      workOrderRepo,
      repoMock<ModuleHandler>(),
      repoMock<UserRole>(),
      repoMock<FieldConfig>(),
      repoMock<Notification>(),
      repoMock<OperationLog>(),
      {} as FieldPermissionService,
      { getLogs: jest.fn() } as unknown as FieldSupplementService,
      { exportSingleDispatchedOrder: jest.fn() } as never,
      validationServiceMock as never,
    );
    const user = { sub: 'handler-1', username: 'handler', roles: ['data_entry_team'] } as JwtUserPayload;

    await expect(service.returnOrder('do-1', { returnReason: 'bad' }, user)).rejects.toMatchObject({ status: HttpStatus.CONFLICT });

    // 父单兜底必须在任何写入前拦截：子单与父单都不得被持久化。
    expect(dispatchedOrderRepo.save).not.toHaveBeenCalled();
    expect(workOrderRepo.save).not.toHaveBeenCalled();
    // 状态保持原值，绝不能被改写成 RETURNED。
    expect(order.status).toBe(DispatchedOrderStatus.PROCESSING);
    expect(parentOrder.status).toBe(WorkOrderStatus.WITHDRAWN);
  });

  it('returnOrder rejects with 409 and writes nothing when the child order itself is withdrawn', async () => {
    const parentOrder = {
      id: 'wo-1',
      orderNo: 'ON20260511001',
      orderType: OrderType.ONBOARDING,
      status: WorkOrderStatus.PROCESSING,
      createdBy: 'u1',
      departmentId: 'd1',
      customerId: 'c1',
      employeeName: 'employee',
      employeeIdCard: '330102199001010011',
      extraData: {},
      submittedAt: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as WorkOrder;
    const order = {
      id: 'do-1',
      parentOrderId: 'wo-1',
      parentOrder,
      moduleCode: 'data_entry',
      status: DispatchedOrderStatus.WITHDRAWN,
      handlerId: 'handler-1',
      visibleFields: ['employee_name'],
      returnReason: '业务员撤回已通过，可直接作废',
      dispatchedAt: new Date(),
      acceptedAt: new Date(),
      completedAt: new Date(),
      voidAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as DispatchedOrder;
    const dispatchedOrderRepo = repoMock<DispatchedOrder>({ findOne: jest.fn(async () => order) });
    const workOrderRepo = repoMock<WorkOrder>();
    const service = new DispatchedOrderService(
      dispatchedOrderRepo,
      workOrderRepo,
      repoMock<ModuleHandler>(),
      repoMock<UserRole>(),
      repoMock<FieldConfig>(),
      repoMock<Notification>(),
      repoMock<OperationLog>(),
      {} as FieldPermissionService,
      { getLogs: jest.fn() } as unknown as FieldSupplementService,
      { exportSingleDispatchedOrder: jest.fn() } as never,
      validationServiceMock as never,
    );
    const user = { sub: 'handler-1', username: 'handler', roles: ['data_entry_team'] } as JwtUserPayload;

    await expect(service.returnOrder('do-1', { returnReason: 'bad' }, user)).rejects.toMatchObject({ status: HttpStatus.CONFLICT });

    expect(dispatchedOrderRepo.save).not.toHaveBeenCalled();
    expect(workOrderRepo.save).not.toHaveBeenCalled();
    // 已撤回子单的状态保持不变，不得被改写成 RETURNED。
    expect(order.status).toBe(DispatchedOrderStatus.WITHDRAWN);
    expect(parentOrder.status).toBe(WorkOrderStatus.PROCESSING);
  });

  it('completes the main order when workflow children are complete even if payroll storage is pending', async () => {
    const parentOrder = {
      id: 'wo-1',
      orderNo: 'ON20260511001',
      orderType: OrderType.ONBOARDING,
      status: WorkOrderStatus.PROCESSING,
      completedAt: null,
    } as WorkOrder;
    const dispatchedOrderRepo = repoMock<DispatchedOrder>({
      find: jest.fn(async () => [
        { ...makeDispatchedOrder(DispatchedOrderStatus.COMPLETED), moduleCode: 'contract' },
        { ...makeDispatchedOrder(DispatchedOrderStatus.PENDING), moduleCode: 'payroll_bank_card' },
      ]),
    });
    const workOrderRepo = repoMock<WorkOrder>({
      findOne: jest.fn(async () => parentOrder),
    });
    const service = new DispatchedOrderService(
      dispatchedOrderRepo,
      workOrderRepo,
      repoMock<ModuleHandler>(),
      repoMock<UserRole>(),
      repoMock<FieldConfig>(),
      repoMock<Notification>(),
      repoMock<OperationLog>(),
      {} as FieldPermissionService,
      {} as FieldSupplementService,
      { exportSingleDispatchedOrder: jest.fn() } as never,
      validationServiceMock as never,
    );
    jest.spyOn(service as any, 'writeLog').mockResolvedValue(undefined);

    await (service as any).checkMainOrderComplete(parentOrder.id);

    expect(parentOrder.status).toBe(WorkOrderStatus.COMPLETED);
    expect(parentOrder.completedAt).toBeInstanceOf(Date);
    expect(workOrderRepo.save).toHaveBeenCalledWith(parentOrder);
  });

  it('batch reassigns workflow rows but skips payroll export records', async () => {
    const orders = [
      {
        ...makeDispatchedOrder(),
        id: 'order-1',
        handlerId: 'old-handler',
        voidAt: null,
      },
      {
        ...makeDispatchedOrder(),
        id: 'order-2',
        handlerId: 'old-handler',
        voidAt: null,
      },
      {
        ...makeDispatchedOrder(),
        id: 'payroll-order',
        moduleCode: 'payroll_bank_card',
        handlerId: null,
        voidAt: null,
      },
    ] as DispatchedOrder[];
    const loadQueryBuilder = {
      select: jest.fn(),
      addSelect: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      groupBy: jest.fn(),
      getRawMany: jest.fn(async () => []),
    };
    loadQueryBuilder.select.mockReturnValue(loadQueryBuilder);
    loadQueryBuilder.addSelect.mockReturnValue(loadQueryBuilder);
    loadQueryBuilder.where.mockReturnValue(loadQueryBuilder);
    loadQueryBuilder.andWhere.mockReturnValue(loadQueryBuilder);
    loadQueryBuilder.groupBy.mockReturnValue(loadQueryBuilder);

    const transactionOrderRepository = { update: jest.fn(async () => ({ affected: 1 })) };
    const transactionLogRepository = {
      create: jest.fn((input) => input),
      save: jest.fn(async (input) => input),
    };
    const transactionNotificationRepository = {
      create: jest.fn((input) => input),
      save: jest.fn(async (input) => input),
    };
    const transactionManager = {
      getRepository: jest.fn((entity) => {
        if (entity === DispatchedOrder) return transactionOrderRepository;
        if (entity === OperationLog) return transactionLogRepository;
        if (entity === Notification) return transactionNotificationRepository;
        throw new Error('unexpected repository');
      }),
    };
    const transaction = jest.fn(async (work) => work(transactionManager));
    const dispatchedOrderRepository = repoMock<DispatchedOrder>({
      find: jest.fn(async () => orders),
      createQueryBuilder: jest.fn(() => loadQueryBuilder),
      manager: { transaction },
    });
    const moduleHandlerRepository = repoMock<ModuleHandler>({
      find: jest.fn(async () => [
        { moduleCode: 'data_entry', handlerId: 'replacement-1', isActive: true, handler: { isActive: true } },
        { moduleCode: 'data_entry', handlerId: 'replacement-2', isActive: true, handler: { isActive: true } },
      ]),
    });
    const service = new DispatchedOrderService(
      dispatchedOrderRepository,
      repoMock<WorkOrder>(),
      moduleHandlerRepository,
      repoMock<UserRole>(),
      repoMock<FieldConfig>(),
      repoMock<Notification>(),
      repoMock<OperationLog>(),
      {} as FieldPermissionService,
      {} as FieldSupplementService,
      { exportSingleDispatchedOrder: jest.fn() } as never,
      validationServiceMock as never,
    );
    jest.spyOn(service as any, 'assertCanViewTeam').mockResolvedValue(undefined);

    const result = await service.batchReassign({
      ids: ['order-1', 'missing-order', 'payroll-order', 'order-2'],
      handlerIds: ['replacement-1', 'replacement-2'],
      strategy: BatchReassignStrategy.ROUND_ROBIN,
      reason: '  rebalance coverage  ',
    }, { sub: 'admin-user', username: 'admin', roles: ['admin'] } as JwtUserPayload);

    expect(result.assignments).toEqual([
      { id: 'order-1', previousHandlerId: 'old-handler', newHandlerId: 'replacement-1' },
      { id: 'order-2', previousHandlerId: 'old-handler', newHandlerId: 'replacement-2' },
    ]);
    expect(result.skipped).toEqual([
      { id: 'missing-order', reason: '子工单不存在' },
      { id: 'payroll-order', reason: '薪酬银行卡导出清单不支持改派' },
    ]);
    expect(transactionOrderRepository.update).toHaveBeenCalledTimes(2);
    expect(transactionOrderRepository.update).toHaveBeenCalledWith('order-1', {
      handlerId: 'replacement-1',
      status: DispatchedOrderStatus.PENDING,
      acceptedAt: null,
    });
    expect(transactionNotificationRepository.save).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
  function makeCompletionTriggerService(workOrder: WorkOrder, enqueue: jest.Mock) {
    const completedChild = {
      id: 'do-completed',
      parentOrderId: workOrder.id,
      status: DispatchedOrderStatus.COMPLETED,
    } as DispatchedOrder;
    const dispatchedOrderRepo = repoMock<DispatchedOrder>({
      find: jest.fn(async () => [completedChild]),
    });
    const workOrderRepo = repoMock<WorkOrder>({
      findOne: jest.fn(async () => workOrder),
    });
    const operationLogRepo = repoMock<OperationLog>();
    const service = new DispatchedOrderService(
      dispatchedOrderRepo,
      workOrderRepo,
      repoMock<ModuleHandler>(),
      repoMock<UserRole>(),
      repoMock<FieldConfig>(),
      repoMock<Notification>(),
      operationLogRepo,
      {} as FieldPermissionService,
      { getLogs: jest.fn() } as unknown as FieldSupplementService,
      { exportSingleDispatchedOrder: jest.fn() } as never,
      validationServiceMock as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { enqueueForCompletedWorkOrder: enqueue } as never,
    );
    return { service, workOrderRepo, operationLogRepo };
  }

  it('enqueues completion email once per completed version and supports re-completion', async () => {
    const workOrder = {
      id: 'wo-email-1',
      orderNo: 'ON20260903001',
      orderType: OrderType.ONBOARDING,
      status: WorkOrderStatus.PROCESSING,
      createdBy: 'u1',
      customerId: 'c1',
      employeeName: 'employee',
      extraData: {},
      completedAt: null,
      completionVersion: 0,
    } as WorkOrder;
    const enqueue = jest.fn(async () => null);
    const { service, workOrderRepo } = makeCompletionTriggerService(workOrder, enqueue);
    const complete = () => (service as unknown as { checkMainOrderComplete(parentOrderId: string): Promise<void> })
      .checkMainOrderComplete(workOrder.id);

    await complete();
    expect(workOrder.status).toBe(WorkOrderStatus.COMPLETED);
    expect(workOrder.completionVersion).toBe(1);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenLastCalledWith(workOrder);

    await complete();
    expect(workOrder.completionVersion).toBe(1);
    expect(enqueue).toHaveBeenCalledTimes(1);

    workOrder.status = WorkOrderStatus.PROCESSING;
    workOrder.completedAt = null;
    await complete();
    expect(workOrder.completionVersion).toBe(2);
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(workOrderRepo.save).toHaveBeenCalledTimes(2);
  });

  it('does not fail work-order completion when completion email enqueue fails', async () => {
    const workOrder = {
      id: 'wo-email-2',
      orderNo: 'ON20260903002',
      orderType: OrderType.ONBOARDING,
      status: WorkOrderStatus.PROCESSING,
      createdBy: 'u1',
      customerId: 'c1',
      employeeName: 'employee',
      extraData: {},
      completedAt: null,
      completionVersion: 0,
    } as WorkOrder;
    const enqueue = jest.fn(async () => { throw new Error('mail queue unavailable'); });
    const { service, workOrderRepo, operationLogRepo } = makeCompletionTriggerService(workOrder, enqueue);
    const loggerError = jest.spyOn((service as unknown as { logger: { error: (...args: unknown[]) => void } }).logger, 'error').mockImplementation(() => undefined);

    await expect((service as unknown as { checkMainOrderComplete(parentOrderId: string): Promise<void> })
      .checkMainOrderComplete(workOrder.id)).resolves.toBeUndefined();

    expect(workOrder.status).toBe(WorkOrderStatus.COMPLETED);
    expect(workOrder.completionVersion).toBe(1);
    expect(workOrderRepo.save).toHaveBeenCalledWith(workOrder);
    expect(operationLogRepo.save).toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalledWith(expect.stringContaining('mail queue unavailable'), expect.any(String));
  });
});

