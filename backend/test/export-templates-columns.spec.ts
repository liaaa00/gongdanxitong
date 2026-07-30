import { Repository } from 'typeorm';
import { ExportTemplatesService } from 'src/modules/admin/export-templates/export-templates.service';
import { DispatchedOrder, ExportTemplate, FieldConfig, OperationLog, OrderAttachment } from 'src/entities';
import { UploadService } from 'src/modules/upload/upload.service';

describe('ExportTemplatesService column titles', () => {
  function repoMock<T extends object>(overrides: Partial<Record<string, unknown>> = {}): Repository<T> {
    return {
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
      save: jest.fn(async (input: T) => input),
      create: jest.fn((input: Partial<T>) => input as T),
      remove: jest.fn(async () => undefined),
      createQueryBuilder: jest.fn(),
      ...overrides,
    } as unknown as Repository<T>;
  }

  function makeService() {
    const service = new ExportTemplatesService(
      repoMock<ExportTemplate>(),
      repoMock<DispatchedOrder>({
        createQueryBuilder: jest.fn(),
        findOne: jest.fn(),
      }),
      repoMock<OperationLog>(),
      repoMock<FieldConfig>({
        find: jest.fn(async () => [
          { fieldCode: 'employee_name', fieldName: '员工姓名' },
          { fieldCode: 'id_card_no', fieldName: '证件号码' },
        ] as FieldConfig[]),
      }),
      repoMock<OrderAttachment>(),
      { saveBuffer: jest.fn() } as unknown as UploadService,
    );
    return service;
  }

  it('removes system identity columns and appends creator column for every export template', async () => {
    const service = makeService();
    const fieldNameMap = new Map([
      ['employee_name', '员工姓名'],
      ['id_card_no', '证件号码'],
      ['created_by_name', '发起人'],
      ['order_no', '工单编号'],
      ['employee_id_card', '员工证件号'],
    ]);
    const template = {
      id: 'tpl-identity',
      templateName: '身份列模板',
      moduleCode: 'contract',
      fieldList: [
        { fieldCode: 'order_no', alias: '工单编号', order: 1 },
        { fieldCode: 'employee_id_card', alias: '员工证件号', order: 2 },
        { fieldCode: 'employee_name', alias: '员工姓名', order: 3 },
      ],
      createdBy: 'admin',
      isShared: true,
      createdAt: new Date(),
    } as unknown as ExportTemplate;

    const fieldList = (service as unknown as { ensureImportIdentityColumns: (fieldList: Array<Record<string, unknown>>) => Array<Record<string, unknown>> }).ensureImportIdentityColumns(template.fieldList as Array<Record<string, unknown>>);
    const columns = (service as unknown as { resolveColumns: (template: ExportTemplate, fieldNameMap: Map<string, string>) => Array<{ fieldCode: string; title: string; order: number }> }).resolveColumns(
      { ...template, fieldList } as ExportTemplate,
      fieldNameMap,
    );

    expect(columns.map((column) => column.fieldCode)).toEqual(['employee_name', 'created_by_name']);
    expect(columns.map((column) => column.title)).toEqual(['员工姓名', '发起人']);
  });

  it('also appends creator column for verbatim templates', async () => {
    const service = makeService();
    const resolveDefault = (service as unknown as {
      resolveDefaultTemplate: (moduleCode: string, visibleFields: string[], signPlatform?: string | null) => Promise<ExportTemplate>;
    }).resolveDefaultTemplate.bind(service);

    const esign = {
      id: 'tpl-esign', templateName: 'e签宝', moduleCode: 'contract', isShared: true,
      signPlatform: 'E签宝', createdBy: 'admin', createdAt: new Date(),
      fieldList: [{ fieldCode: 'employee_name', alias: '姓名', header: ['r1', 'r2'], order: 1 }],
    } as unknown as ExportTemplate;
    const onboarding = {
      id: 'tpl-onboarding', templateName: '入职联系', moduleCode: 'onboarding_contact', isShared: true,
      signPlatform: null, createdBy: 'admin', createdAt: new Date(),
      fieldList: [{ fieldCode: 'employee_name', alias: '姓名', header: ['姓名'], order: 1 }],
    } as unknown as ExportTemplate;

    for (const tpl of [esign, onboarding]) {
      (service as unknown as { repository: { findOne: jest.Mock } }).repository.findOne = jest.fn(async () => tpl);
      const resolved = await resolveDefault(tpl.moduleCode, [], tpl.signPlatform ?? undefined);
      expect(resolved.fieldList.map((item) => (item as Record<string, unknown>).fieldCode)).toEqual(['employee_name', 'created_by_name']);
      expect(resolved.fieldList.some((item) => (item as Record<string, unknown>).fieldCode === 'order_no')).toBe(false);
      expect(resolved.fieldList.some((item) => (item as Record<string, unknown>).fieldCode === 'employee_id_card')).toBe(false);
    }
  });

  it('falls back to Chinese field names when alias is missing or still equal to field code', async () => {
    const service = makeService();
    const template = {
      id: 'tpl-1',
      templateName: '示例模板',
      moduleCode: 'contract',
      fieldList: [
        { fieldCode: 'employee_name', alias: 'employee_name', order: 1 },
        { fieldCode: 'id_card_no', alias: '', order: 2 },
        { fieldCode: 'customer_name', alias: 'Customer Name', order: 3 },
      ],
      createdBy: 'admin',
      isShared: true,
      createdAt: new Date(),
    } as unknown as ExportTemplate;

    const result = (service as unknown as { resolveColumns: (template: ExportTemplate, fieldNameMap: Map<string, string>) => Array<{ fieldCode: string; title: string; order: number }> }).resolveColumns(
      template,
      new Map([
        ['employee_name', '员工姓名'],
        ['id_card_no', '证件号码'],
        ['customer_name', '客户名称'],
      ]),
    );

    expect(result).toEqual([
      { fieldCode: 'employee_name', title: '员工姓名', order: 1 },
      { fieldCode: 'id_card_no', title: '证件号码', order: 2 },
      { fieldCode: 'customer_name', title: '客户名称', order: 3 },
      { fieldCode: 'created_by_name', title: '发起人', order: 4 },
    ]);
  });
});
