import { ExportTemplatesService } from 'src/modules/admin/export-templates/export-templates.service';
import { DispatchedOrder, ExportTemplate, FieldConfig, OperationLog } from 'src/entities';

describe('ExportTemplatesService default shared template', () => {
  it('prefers the newest shared template for the same module', async () => {
    const sharedOld = { id: 'old', templateName: '旧模板', moduleCode: 'data_entry', fieldList: [{ fieldCode: 'employee_name', alias: '姓名_old', order: 1 }], createdBy: 'u1', isShared: true, createdAt: new Date('2026-05-01T00:00:00.000Z') };
    const sharedNew = { id: 'new', templateName: '新模板', moduleCode: 'data_entry', fieldList: [{ fieldCode: 'employee_name', alias: '姓名_new', order: 1 }], createdBy: 'u1', isShared: true, createdAt: new Date('2026-05-20T00:00:00.000Z') };
    const templateRepo = {
      findOne: jest.fn(async ({ where, order }: { where?: { moduleCode?: string; isShared?: boolean }; order?: { createdAt?: 'ASC' | 'DESC' } }) => {
        if (where?.moduleCode === 'data_entry' && where.isShared) {
          return order?.createdAt === 'DESC' ? sharedNew : sharedOld;
        }
        return null;
      }),
      createQueryBuilder: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(),
      remove: jest.fn(),
    };
    const dispatchedRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(async () => ({ id: 'do-1', moduleCode: 'data_entry', visibleFields: ['employee_name'], parentOrder: { orderNo: 'ON1', employeeName: '张三', employeeIdCard: '3301', extraData: {} }, handler: null, handlerId: null, status: 'pending', dispatchedAt: new Date(), acceptedAt: null, completedAt: null, createdAt: new Date(), updatedAt: new Date() } as unknown as DispatchedOrder)),
    };
    const logRepo = { create: jest.fn((x) => x), save: jest.fn(async (x) => x) };
    const fieldRepo = { find: jest.fn(async () => [{ fieldCode: 'employee_name', fieldName: '姓名' } as FieldConfig]) };
    const upload = { saveBuffer: jest.fn(async () => ({ fileId: 'file-1', originalName: 'export.xlsx' })) };
    const service = new ExportTemplatesService(templateRepo as never, dispatchedRepo as never, logRepo as never, fieldRepo as never, { find: jest.fn(async () => []) } as never, upload as never);

    const result = await service.exportSingleDispatchedOrder('do-1', undefined, { sub: 'u1' } as never);

    expect(result.templateId).toBe('new');
    expect(result.templateName).toBe('新模板');
  });
});
