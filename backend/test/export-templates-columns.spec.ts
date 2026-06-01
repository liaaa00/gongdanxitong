import { Repository } from 'typeorm';
import { ExportTemplatesService } from 'src/modules/admin/export-templates/export-templates.service';
import { DispatchedOrder, ExportTemplate, FieldConfig, OperationLog } from 'src/entities';
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
          { fieldCode: 'id_card_no', fieldName: '身份证号码' },
        ] as FieldConfig[]),
      }),
      { saveBuffer: jest.fn() } as unknown as UploadService,
    );
    return service;
  }

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
        ['id_card_no', '身份证号码'],
        ['customer_name', '客户名称'],
      ]),
    );

    expect(result).toEqual([
      { fieldCode: 'employee_name', title: '员工姓名', order: 1 },
      { fieldCode: 'id_card_no', title: '身份证号码', order: 2 },
      { fieldCode: 'customer_name', title: '客户名称', order: 3 },
    ]);
  });
});
