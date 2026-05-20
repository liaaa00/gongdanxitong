import { ExportTemplatesService } from 'src/modules/admin/export-templates/export-templates.service';

const NAME = '\u59d3\u540d';
const ID_NO = '\u8bc1\u4ef6\u53f7';
const ORDER_NO = '\u5de5\u5355\u53f7';
const EXPORT_NAME = '\u5bfc\u51fa';

describe('ExportTemplatesService', () => {
  function serviceWith(template: Record<string, unknown>, orders: Array<Record<string, unknown>>) {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => orders),
    };
    const templateRepo = { findOne: jest.fn(async () => template), createQueryBuilder: jest.fn(), create: jest.fn((x) => x), save: jest.fn(), remove: jest.fn() };
    const dispatchedRepo = { createQueryBuilder: jest.fn(() => qb), findOne: jest.fn(async () => orders[0]) };
    const logRepo = { create: jest.fn((x) => x), save: jest.fn(async (x) => x) };
    const fieldRepo = { find: jest.fn(async () => [
      { fieldCode: 'employee_name', fieldName: NAME },
      { fieldCode: 'employee_id_card', fieldName: ID_NO },
    ]) };
    const upload = { saveBuffer: jest.fn(async () => ({ fileId: 'file-1', originalName: 'export.xlsx' })) };
    return {
      service: new ExportTemplatesService(templateRepo as never, dispatchedRepo as never, logRepo as never, fieldRepo as never, upload as never),
      upload,
      logRepo,
      templateRepo,
    };
  }

  it('previews rows using field list aliases and built-in placeholders', async () => {
    const template = { id: 'tpl-1', templateName: EXPORT_NAME, moduleCode: 'contract', fieldList: [
      { fieldCode: 'order_no', alias: ORDER_NO, order: 1 },
      { fieldCode: 'employee_name', alias: NAME, order: 2 },
    ] };
    const orders = [{ moduleCode: 'contract', handlerId: 'u1', handler: { realName: 'operator' }, status: 'pending', parentOrder: { orderNo: 'ON1', employeeName: '\u5f20\u4e09', employeeIdCard: '3301', extraData: {} } }];
    const { service } = serviceWith(template, orders);

    const result = await service.previewApply('tpl-1', ['do-1']);

    expect(result.columns.map((column) => column.title)).toEqual([ORDER_NO, NAME]);
    expect(result.rows[0]).toEqual({ [ORDER_NO]: 'ON1', [NAME]: '\u5f20\u4e09' });
  });

  it('falls back to field_configs.field_name when alias is stored as question marks', async () => {
    const template = { id: 'tpl-1', templateName: EXPORT_NAME, moduleCode: 'data_entry', fieldList: [
      { fieldCode: 'employee_name', alias: '??', order: 1 },
      { fieldCode: 'employee_id_card', alias: '???', order: 2 },
    ] };
    const orders = [{ moduleCode: 'data_entry', handler: null, handlerId: null, status: 'pending', parentOrder: { orderNo: 'ON1', employeeName: '\u5f20\u4e09', employeeIdCard: '3301', extraData: {} } }];
    const { service } = serviceWith(template, orders);

    const result = await service.previewApply('tpl-1', ['do-1']);

    expect(result.columns.map((column) => column.title)).toEqual([NAME, ID_NO]);
    expect(result.rows[0]).toEqual({ [NAME]: '\u5f20\u4e09', [ID_NO]: '3301' });
  });

  it('normalizes question-mark aliases when creating and reading templates', async () => {
    const template = { id: 'tpl-1', templateName: EXPORT_NAME, moduleCode: 'data_entry', fieldList: [{ fieldCode: 'employee_name', alias: '??' }], createdBy: 'u1', isShared: true, createdAt: new Date() };
    const { service, templateRepo } = serviceWith(template, []);
    templateRepo.save.mockImplementationOnce(async (entity: Record<string, unknown>) => ({ ...template, ...entity }));

    const created = await service.create({ templateName: EXPORT_NAME, moduleCode: 'data_entry', fieldList: [{ fieldCode: 'employee_name', alias: '??' }], createdBy: 'u1', isShared: true });
    const detail = await service.get('tpl-1');

    expect(created.fieldList[0].alias).toBe(NAME);
    expect(detail.fieldList[0].alias).toBe(NAME);
  });

  it('generates excel file metadata when applying a template', async () => {
    const template = { id: 'tpl-1', templateName: EXPORT_NAME, moduleCode: 'data_entry', fieldList: [{ fieldCode: 'employee_name', alias: NAME }] };
    const orders = [{ moduleCode: 'data_entry', handler: null, handlerId: null, status: 'pending', parentOrder: { orderNo: 'ON1', employeeName: '\u5f20\u4e09', employeeIdCard: '3301', extraData: {} } }];
    const { service, upload, logRepo } = serviceWith(template, orders);

    const result = await service.apply('tpl-1', ['do-1'], { sub: 'admin-1' } as never);

    expect(upload.saveBuffer).toHaveBeenCalled();
    expect(logRepo.save).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'apply_export_template' }));
    expect(result.downloadUrl).toBe('/api/files/file-1');
  });
});
