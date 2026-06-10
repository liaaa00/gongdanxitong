import { ExportTemplatesService } from 'src/modules/admin/export-templates/export-templates.service';

const NAME = '\u59d3\u540d';
const ID_NO = '\u8bc1\u4ef6\u53f7\u7801';
const CREATOR = '\u53d1\u8d77\u4eba';
const ORDER_NO = '\u5de5\u5355\u53f7';
const EXPORT_NAME = '\u5bfc\u51fa';

describe('ExportTemplatesService', () => {
  function serviceWith(template: Record<string, unknown>, orders: Array<Record<string, unknown>>, extraFields: Array<Record<string, unknown>> = []) {
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
      { fieldCode: 'id_card_no', fieldName: ID_NO },
      { fieldCode: 'created_by_name', fieldName: CREATOR },
      ...extraFields,
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
    const orders = [{ moduleCode: 'contract', handlerId: 'u1', handler: { realName: 'operator' }, status: 'pending', parentOrder: { orderNo: 'ON1', employeeName: '\u5f20\u4e09', employeeIdCard: '3301', createdBy: 'creator-1', creator: { realName: '\u738b\u4e94' }, extraData: {} } }];
    const { service } = serviceWith(template, orders);

    const result = await service.previewApply('tpl-1', ['do-1']);

    expect(result.columns.map((column) => column.title)).toEqual([NAME, CREATOR]);
    expect(result.rows[0]).toEqual({ [NAME]: '\u5f20\u4e09', [CREATOR]: '\u738b\u4e94' });
  });

  it('falls back to field_configs.field_name when alias is stored as question marks', async () => {
    const template = { id: 'tpl-1', templateName: EXPORT_NAME, moduleCode: 'data_entry', fieldList: [
      { fieldCode: 'employee_name', alias: '??', order: 1 },
      { fieldCode: 'employee_id_card', alias: '???', order: 2 },
    ] };
    const orders = [{ moduleCode: 'data_entry', handler: null, handlerId: null, status: 'pending', parentOrder: { orderNo: 'ON1', employeeName: '\u5f20\u4e09', employeeIdCard: '3301', createdBy: 'creator-1', creator: { username: 'creator' }, extraData: {} } }];
    const { service } = serviceWith(template, orders);

    const result = await service.previewApply('tpl-1', ['do-1']);

    expect(result.columns.map((column) => column.title)).toEqual([NAME, CREATOR]);
    expect(result.rows[0]).toEqual({ [NAME]: '\u5f20\u4e09', [CREATOR]: 'creator' });
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

  it('writes formula columns referencing same-row cells and order-data literals', async () => {
    const GENDER = '\u6027\u522b';
    const PROBATION_END = '\u8bd5\u7528\u671f\u7ec8\u6b62';
    const ID_CARD = '\u8bc1\u4ef6\u53f7\u7801';
    const PROBATION_START = '\u8bd5\u7528\u671f\u8d77\u59cb';
    const template = { id: 'tpl-1', templateName: EXPORT_NAME, moduleCode: 'contract', fieldList: [
      { fieldCode: 'id_card_no', alias: ID_CARD, header: [ID_CARD], order: 1 },
      { fieldCode: 'probation_start_date', alias: PROBATION_START, header: [PROBATION_START], order: 2 },
      { fieldCode: 'gender', alias: GENDER, header: [GENDER], order: 3, formula: 'IFERROR(IF(MOD(VALUE(MID({id_card_no},17,1)),2)=1,"\u7537","\u5973"),"")' },
      { fieldCode: 'probation_end_date', alias: PROBATION_END, header: [PROBATION_END], order: 4, numFmt: 'yyyy/mm/dd', formula: 'IFERROR(EDATE({probation_start_date},VALUE({probation_months}))-1,"")' },
    ] };
    const orders = [{ moduleCode: 'contract', handler: null, handlerId: null, status: 'pending', parentOrder: { orderNo: 'ON1', employeeName: '\u5f20\u4e09', employeeIdCard: '3301', extraData: { id_card_no: '110101199001011234', probation_start_date: '2026-06-01', probation_months: '3' } } }];
    const { service, upload } = serviceWith(template, orders);

    const ExcelJS = require('exceljs');
    let captured: Buffer | undefined;
    (upload.saveBuffer as jest.Mock).mockImplementationOnce(async (arg: { buffer: Buffer }) => { captured = arg.buffer; return { fileId: 'file-1', originalName: 'export.xlsx' }; });

    await service.apply('tpl-1', ['do-1'], { sub: 'admin-1' } as never);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(captured);
    const sheet = workbook.worksheets[0];
    const genderCell = sheet.getCell(2, 3);
    const probationCell = sheet.getCell(2, 4);
    expect(genderCell.formula).toBe('IFERROR(IF(MOD(VALUE(MID(A2,17,1)),2)=1,"\u7537","\u5973"),"")');
    expect(probationCell.formula).toBe('IFERROR(EDATE(B2,VALUE("3"))-1,"")');
    expect(probationCell.numFmt).toBe('yyyy/mm/dd');
  });

  async function loadAppliedWorkbook(service: ExportTemplatesService, upload: { saveBuffer: jest.Mock }) {
    const ExcelJS = require('exceljs');
    let captured: Buffer | undefined;
    upload.saveBuffer.mockImplementationOnce(async (arg: { buffer: Buffer }) => { captured = arg.buffer; return { fileId: 'file-1', originalName: 'export.xlsx' }; });
    await service.apply('tpl-1', ['do-1'], { sub: 'admin-1' } as never);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(captured);
    return workbook;
  }

  it('adds list dropdowns from field config options and keeps column count (suchuang-like)', async () => {
    const NEED_ESIGN = '\u662f\u5426\u7535\u5b50\u7b7e';
    const POS_TYPE = '\u5c97\u4f4d\u7c7b\u578b';
    const WORK_HOUR = '\u5de5\u65f6\u5236';
    const template = { id: 'tpl-1', templateName: EXPORT_NAME, moduleCode: 'contract', fieldList: [
      { fieldCode: 'employee_name', alias: NAME, header: [NAME, ''], order: 1 },
      { fieldCode: 'need_esign', alias: NEED_ESIGN, header: [NEED_ESIGN, ''], order: 2 },
      { fieldCode: 'position_type', alias: POS_TYPE, header: [POS_TYPE, ''], order: 3 },
      { fieldCode: 'work_hour_system', alias: WORK_HOUR, header: [WORK_HOUR, ''], order: 4 },
    ] };
    const orders = [{ moduleCode: 'contract', handler: null, handlerId: null, status: 'pending', parentOrder: { orderNo: 'ON1', employeeName: '\u5f20\u4e09', employeeIdCard: '3301', extraData: { need_esign: '\u662f', position_type: '\u7ba1\u7406\u7c7b', work_hour_system: '\u6807\u51c6\u5de5\u65f6\u5236' } } }];
    const { service, upload } = serviceWith(template, orders, [
      { fieldCode: 'need_esign', fieldName: NEED_ESIGN, dropdownOptions: ['\u662f', '\u5426'] },
      { fieldCode: 'position_type', fieldName: POS_TYPE, dropdownOptions: ['\u7ba1\u7406\u7c7b', '\u975e\u7ba1\u7406\u7c7b'] },
      { fieldCode: 'work_hour_system', fieldName: WORK_HOUR, dropdownOptions: ['\u6807\u51c6\u5de5\u65f6\u5236'] },
    ]);

    const workbook = await loadAppliedWorkbook(service, upload as never);
    const sheet = workbook.worksheets[0];

    expect(sheet.columnCount).toBe(5);
    const headerRowCount = 2;
    const firstDataRow = headerRowCount + 1;
    expect(sheet.getCell(firstDataRow, 2).dataValidation?.type).toBe('list');
    expect(sheet.getCell(firstDataRow, 3).dataValidation?.type).toBe('list');
    expect(sheet.getCell(firstDataRow, 4).dataValidation?.type).toBe('list');
    expect(sheet.getCell(firstDataRow, 1).dataValidation).toBeUndefined();
    expect(sheet.getCell(firstDataRow, 5).dataValidation).toBeUndefined();

    const optionsSheet = workbook.getWorksheet('__options');
    expect(optionsSheet).toBeDefined();
    expect(optionsSheet.state).toBe('veryHidden');
  });

  it('exports e-sign contract data into the provided standard workbook template', async () => {
    const template = { id: 'tpl-1', templateName: EXPORT_NAME, moduleCode: 'contract', signPlatform: 'E\u7b7e\u5b9d', fieldList: [
      { fieldCode: 'employee_name', order: 1 },
      { fieldCode: 'mobile', order: 2 },
      { fieldCode: 'id_card_type', order: 3 },
      { fieldCode: 'id_card_no', order: 4 },
      { const: '', order: 5 },
      { fieldCode: 'contract_subject', order: 6 },
      { fieldCode: 'company_address', order: 7 },
      { sameAs: 'employee_name', order: 8 },
      { fieldCode: 'gender', order: 9, formula: 'IFERROR(IF(MOD(VALUE(MID({id_card_no},17,1)),2)=1,"\u7537","\u5973"),"")' },
      { sameAs: 'id_card_no', order: 10 },
    ] };
    const orders = [{ moduleCode: 'contract', handler: null, handlerId: null, status: 'pending', parentOrder: { orderNo: 'ON1', employeeName: '\u5f20\u4e09', employeeIdCard: '3301', extraData: { mobile: '13800000000', id_card_no: '110101199001011234', id_card_type: '\u4e2d\u56fd\u5c45\u6c11\u8eab\u4efd\u8bc1', contract_subject: '\u4e0a\u6d77\u5916\u670d', company_address: '\u4e0a\u6d77' } } }];
    const { service, upload } = serviceWith(template, orders);

    const workbook = await loadAppliedWorkbook(service, upload as never);
    const sheet = workbook.worksheets[0];

    expect(sheet.name).toBe('Sheet1');
    expect(sheet.columnCount).toBe(30);
    expect(sheet.getRow(3).hidden).toBe(true);
    expect(sheet.getCell(2, 4).value).toBe('\u8bc1\u4ef6\u53f7(\u9009\u586b)-\u7b7e\u7f72\u65b92');
    const firstDataRow = 5;
    expect(sheet.getCell(firstDataRow, 1).value).toBe('\u5f20\u4e09');
    expect(sheet.getCell(firstDataRow, 2).value).toBe('13800000000');
    expect(sheet.getCell(firstDataRow, 4).value).toBe('110101199001011234');
    expect(sheet.getCell(firstDataRow, 8).value).toBe('\u5f20\u4e09');
    expect(sheet.getCell(firstDataRow, 9).formula).toBe('IFERROR(IF(MOD(VALUE(MID(D5,17,1)),2)=1,"\u7537","\u5973"),"")');
    expect(sheet.getCell(firstDataRow, 10).value).toBe('110101199001011234');
  });

  it('dropdowns is_common_template for onboarding contact and leaves text columns alone', async () => {
    const IS_COMMON = '\u662f\u5426\u4e3a\u901a\u7528\u6a21\u677f';
    const template = { id: 'tpl-1', templateName: EXPORT_NAME, moduleCode: 'onboarding_contact', fieldList: [
      { fieldCode: 'employee_name', alias: NAME, header: [NAME], order: 1 },
      { fieldCode: 'is_common_template', alias: IS_COMMON, header: [IS_COMMON], order: 2 },
    ] };
    const orders = [{ moduleCode: 'onboarding_contact', handler: null, handlerId: null, status: 'pending', parentOrder: { orderNo: 'ON1', employeeName: '\u5f20\u4e09', employeeIdCard: '3301', extraData: { is_common_template: '\u662f' } } }];
    const { service, upload } = serviceWith(template, orders, [
      { fieldCode: 'is_common_template', fieldName: IS_COMMON, dropdownOptions: ['\u662f', '\u5426'] },
    ]);

    const workbook = await loadAppliedWorkbook(service, upload as never);
    const sheet = workbook.worksheets[0];

    expect(sheet.columnCount).toBe(3);
    expect(sheet.getCell(2, 2).dataValidation?.type).toBe('list');
    expect(sheet.getCell(2, 1).dataValidation).toBeUndefined();
    expect(sheet.getCell(2, 3).dataValidation).toBeUndefined();
  });

  it('exports admin-configured empty and default template columns', async () => {
    const EMPTY_HEADER = '\u7535\u8111\u53f7';
    const DEFAULT_HEADER = '\u7b7e\u8ba2\u65b9\u5f0f';
    const template = { id: 'tpl-1', templateName: EXPORT_NAME, moduleCode: 'contract', fieldList: [
      { fieldCode: 'employee_name', alias: NAME, order: 1 },
      { const: '', alias: EMPTY_HEADER, order: 2 },
      { const: '\u65b0\u7b7e', alias: DEFAULT_HEADER, order: 3 },
    ] };
    const orders = [{ moduleCode: 'contract', handler: null, handlerId: null, status: 'pending', parentOrder: { orderNo: 'ON1', employeeName: '\u5f20\u4e09', employeeIdCard: '3301', createdBy: 'creator-1', creator: { realName: '\u738b\u4e94' }, extraData: {} } }];
    const { service, upload } = serviceWith(template, orders);

    const preview = await service.previewApply('tpl-1', ['do-1']);
    expect(preview.columns.map((column) => column.title)).toEqual([NAME, EMPTY_HEADER, DEFAULT_HEADER, CREATOR]);
    expect(preview.rows[0]).toEqual({ [NAME]: '\u5f20\u4e09', [EMPTY_HEADER]: '', [DEFAULT_HEADER]: '\u65b0\u7b7e', [CREATOR]: '\u738b\u4e94' });

    const workbook = await loadAppliedWorkbook(service, upload as never);
    const sheet = workbook.worksheets[0];
    expect(sheet.getCell(1, 2).value).toBe(EMPTY_HEADER);
    expect(sheet.getCell(2, 2).value).toBe('');
    expect(sheet.getCell(1, 3).value).toBe(DEFAULT_HEADER);
    expect(sheet.getCell(2, 3).value).toBe('\u65b0\u7b7e');
  });
});
