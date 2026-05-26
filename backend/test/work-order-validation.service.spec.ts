import { DataSource, Repository } from 'typeorm';
import { FieldConfig, FieldType, OrderType, WorkOrder, WorkOrderStatus } from 'src/entities';
import { AstEvaluator } from 'src/modules/dispatch-engine/ast-evaluator';
import { WorkOrderValidationService } from 'src/modules/work-orders/work-order-validation.service';

function field(input: Partial<FieldConfig>): FieldConfig {
  return {
    id: input.id ?? input.fieldCode ?? 'id',
    fieldCode: input.fieldCode ?? 'employee_name',
    fieldName: input.fieldName ?? '姓名',
    fieldType: input.fieldType ?? FieldType.TEXT,
    isRequired: input.isRequired ?? false,
    defaultRequired: input.defaultRequired ?? false,
    conditionalRequired: input.conditionalRequired ?? null,
    validationRegex: input.validationRegex ?? null,
    validationMsg: input.validationMsg ?? null,
    dropdownOptions: input.dropdownOptions ?? null,
    collectionGroup: null,
    placeholder: null,
    helpText: null,
    orderType: input.orderType ?? OrderType.ONBOARDING,
    businessContext: null,
    displayOrder: input.displayOrder ?? 1,
    isActive: true,
    createdAt: new Date('2026-05-18T00:00:00.000Z'),
  } as FieldConfig;
}

function makeWorkOrder(extraData: Record<string, unknown>): WorkOrder {
  return Object.assign(new WorkOrder(), {
    id: 'wo-1',
    orderNo: 'ON20260518001',
    orderType: OrderType.ONBOARDING,
    status: WorkOrderStatus.DRAFT,
    createdBy: 'user-1',
    departmentId: 'dep-1',
    customerId: 'customer-1',
    employeeName: String(extraData.employee_name ?? ''),
    employeeIdCard: String(extraData.id_card_no ?? ''),
    extraData,
    submittedAt: null,
    completedAt: null,
    lastModifiedAt: null,
    lastModifiedBy: null,
    modificationRound: 0,
    createdAt: new Date('2026-05-18T00:00:00.000Z'),
    updatedAt: new Date('2026-05-18T00:00:00.000Z'),
  });
}

describe('WorkOrderValidationService submit validation', () => {
  const fields = [
    field({ fieldCode: 'employee_name', fieldName: '姓名', isRequired: true }),
    field({ fieldCode: 'id_card_no', fieldName: '身份证号', isRequired: true, validationRegex: '^[0-9Xx]{15,18}$' }),
    field({ fieldCode: 'need_company_contract', fieldName: '是否企服发起劳动合同', fieldType: FieldType.DROPDOWN, dropdownOptions: ['是', '否'] }),
    field({ fieldCode: 'contract_template', fieldName: '劳动合同模板', conditionalRequired: { field: 'need_company_contract', op: 'EQ', value: '是' } }),
    field({ fieldCode: 'household_type', fieldName: '户籍性质', fieldType: FieldType.DROPDOWN, dropdownOptions: ['农业', '非农业'] }),
  ];

  const fieldConfigRepository = {
    find: jest.fn(async () => fields),
  } as unknown as Repository<FieldConfig>;

  const service = new WorkOrderValidationService(
    fieldConfigRepository,
    { count: jest.fn() } as unknown as Repository<WorkOrder>,
    { query: jest.fn() } as unknown as DataSource,
    new AstEvaluator(),
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows submit with raw household_type text outside dropdown options', async () => {
    await expect(service.validateWorkOrder(makeWorkOrder({
      employee_name: '孙八',
      id_card_no: '330102199001010011',
      need_company_contract: '否',
      household_type: '城镇户口',
    }))).resolves.toBeUndefined();
  });

  it('allows submit without the removed social insurance urge field', async () => {
    await expect(service.validateWorkOrder(makeWorkOrder({
      employee_name: '周九',
      id_card_no: '330102199001010011',
      need_company_contract: '否',
    }))).resolves.toBeUndefined();
  });

  it('allows submit when contract_template is blank even if company contract is required', async () => {
    await expect(service.validateWorkOrder(makeWorkOrder({
      employee_name: '吴十',
      id_card_no: '330102199001010011',
      need_company_contract: '是',
      contract_template: null,
    }))).resolves.toBeUndefined();
  });

  it('still blocks strict required fields during submit', async () => {
    await expect(service.validateWorkOrder(makeWorkOrder({
      employee_name: '',
      id_card_no: '330102199001010011',
      need_company_contract: '否',
    }))).rejects.toMatchObject({
      response: expect.objectContaining({
        details: expect.objectContaining({ missing: ['employee_name'] }),
      }),
    });
  });
});
