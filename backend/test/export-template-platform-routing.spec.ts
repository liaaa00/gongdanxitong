import { ExportTemplatesService } from 'src/modules/admin/export-templates/export-templates.service';
import { DispatchedOrder, ExportTemplate, FieldConfig } from 'src/entities';

const NAME = '\u59d3\u540d';
const ID_NO = '\u8bc1\u4ef6\u53f7\u7801';
const CREATOR = '\u53d1\u8d77\u4eba';
const SUCHUANG = '\u901f\u521b';
const ESIGN = 'E\u7b7e\u5b9d';
const SUCHUANG_SHEET = '\u52b3\u52a8\u5408\u540c\u6279\u5bfc\u5165\u6a21\u677f2026-05-26';


describe('ExportTemplatesService platform routing', () => {
  it('splits mixed contract batch exports by electronic-sign platform and uses matching templates', async () => {
    const orders = [
      makeOrder('do-suchuang', '\u5f20\u4e09', SUCHUANG),
      makeOrder('do-esign', '\u674e\u56db', ESIGN),
    ];
    const suchuangTemplate = makeTemplate('tpl-suchuang', '\u52b3\u52a8\u5408\u540c\u7b7e\u8ba2\u6279\u5bfc\u51fa\u6a21\u677f-\u901f\u521b', SUCHUANG, [
      { fieldCode: 'customer_code', order: 1 },
      { const: '', order: 2 },
      { fieldCode: 'id_card_no', order: 3 },
      { fieldCode: 'need_esign', order: 4 },
      { fieldCode: 'employee_name', order: 5 },
    ]);
    const esignTemplate = makeTemplate('tpl-esign', '\u52b3\u52a8\u5408\u540c\u7b7e\u8ba2\u6279\u5bfc\u51fa\u6a21\u677f-e\u7b7e\u5b9d', ESIGN, [
      { fieldCode: 'employee_name', order: 1 },
      { fieldCode: 'mobile', order: 2 },
      { fieldCode: 'id_card_type', order: 3 },
      { fieldCode: 'id_card_no', order: 4 },
      { const: '', order: 5 },
      { fieldCode: 'contract_subject', order: 6 },
      { fieldCode: 'company_address', order: 7 },
      { sameAs: 'employee_name', order: 8 },
      { fieldCode: 'gender', formula: 'IFERROR(IF(MOD(VALUE(MID({id_card_no},17,1)),2)=1,"\u7537","\u5973"),"")', order: 9 },
      { sameAs: 'id_card_no', order: 10 },
    ]);

    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => orders),
    };
    const templateRepo = {
      findOne: jest.fn(async ({ where }: { where?: { moduleCode?: string; isShared?: boolean; signPlatform?: string } }) => {
        if (where?.moduleCode !== 'contract' || !where.isShared) return null;
        if (where.signPlatform === SUCHUANG) return { ...suchuangTemplate, fieldList: [...suchuangTemplate.fieldList] };
        if (where.signPlatform === ESIGN) return { ...esignTemplate, fieldList: [...esignTemplate.fieldList] };
        return null;
      }),
      createQueryBuilder: jest.fn(),
      create: jest.fn((input) => input),
      save: jest.fn(),
      remove: jest.fn(),
    };
    const dispatchedRepo = { createQueryBuilder: jest.fn(() => qb), findOne: jest.fn() };
    const logRepo = { create: jest.fn((input) => input), save: jest.fn(async (input) => input) };
    const fieldRepo = {
      find: jest.fn(async () => [
        { fieldCode: 'employee_name', fieldName: NAME },
        { fieldCode: 'id_card_no', fieldName: ID_NO },
        { fieldCode: 'created_by_name', fieldName: CREATOR },
      ] as FieldConfig[]),
    };
    let uploadIndex = 0;
    const upload = {
      saveBuffer: jest.fn(async ({ buffer, originalName }: { buffer: Buffer; originalName: string }) => {
        uploadIndex += 1;
        return { fileId: `file-${uploadIndex}`, originalName, buffer };
      }),
    };
    const service = new ExportTemplatesService(
      templateRepo as never,
      dispatchedRepo as never,
      logRepo as never,
      fieldRepo as never,
      upload as never,
    );

    const result = await service.exportDispatchedOrdersAuto(['do-suchuang', 'do-esign'], undefined, { sub: 'admin-1' } as never);

    expect(result.moduleCode).toBe('contract');
    expect(result.rowCount).toBe(2);
    expect(result.files).toHaveLength(2);
    expect(templateRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ moduleCode: 'contract', isShared: true, signPlatform: SUCHUANG }),
    }));
    expect(templateRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ moduleCode: 'contract', isShared: true, signPlatform: ESIGN }),
    }));
    expect(logRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      afterData: expect.objectContaining({
        moduleCodes: ['contract'],
        exportGroups: [
          { moduleCode: 'contract', signPlatform: SUCHUANG, count: 1 },
          { moduleCode: 'contract', signPlatform: ESIGN, count: 1 },
        ],
      }),
    }));

    const ExcelJS = require('exceljs');
    const capturedCalls = upload.saveBuffer.mock.calls as Array<[{ buffer: Buffer; originalName: string }]>;
    const parsed = [] as Array<{ originalName: string; sheetNames: string[]; workbook: any }>;
    for (const [payload] of capturedCalls) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(payload.buffer);
      parsed.push({ originalName: payload.originalName, sheetNames: workbook.worksheets.map((sheet: { name: string }) => sheet.name), workbook });
    }
    expect(parsed).toHaveLength(2);
    expect(parsed.some((item) => item.originalName.includes(SUCHUANG) && item.sheetNames.includes(SUCHUANG_SHEET))).toBe(true);
    expect(parsed.some((item) => item.originalName.includes(ESIGN) && item.sheetNames.includes('Sheet1'))).toBe(true);
    const suchuang = parsed.find((item) => item.originalName.includes(SUCHUANG))!;
    const esign = parsed.find((item) => item.originalName.includes(ESIGN))!;
    expect(suchuang.workbook.getWorksheet(SUCHUANG_SHEET)?.getCell(2, 3).value).toBe('\u8eab\u4efd\u8bc1\u53f7');
    expect(suchuang.workbook.getWorksheet(SUCHUANG_SHEET)?.getCell(4, 3).value).toBe('ID-do-suchuang');
    expect(suchuang.workbook.getWorksheet(SUCHUANG_SHEET)?.getCell(4, 5).value).toBe('\u5f20\u4e09');
    expect(esign.workbook.getWorksheet('Sheet1')?.getCell(2, 4).value).toBe('\u8bc1\u4ef6\u53f7(\u9009\u586b)-\u7b7e\u7f72\u65b92');
    expect(esign.workbook.getWorksheet('Sheet1')?.getCell(5, 1).value).toBe('\u674e\u56db');
    expect(esign.workbook.getWorksheet('Sheet1')?.getCell(5, 4).value).toBe('ID-do-esign');
    expect(esign.workbook.getWorksheet('Sheet1')?.getRow(3).hidden).toBe(true);
  }, 30000);

  it('does not fall back to an arbitrary contract template when electronic-sign platform is missing', async () => {
    const order = makeOrder('do-missing-platform', '\u738b\u4e94', '');
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => [order]),
    };
    const templateRepo = {
      findOne: jest.fn(async ({ where }: { where?: { moduleCode?: string; isShared?: boolean; signPlatform?: string } }) => {
        if (where?.moduleCode === 'contract' && where.isShared && where.signPlatform === undefined) {
          return makeTemplate('tpl-esign', 'E\u7b7e\u5b9d\u6a21\u677f', ESIGN, [
            { fieldCode: 'employee_name', alias: NAME, header: ['file', NAME, 'bind-name', ''], order: 1 },
          ]);
        }
        return null;
      }),
      createQueryBuilder: jest.fn(),
      create: jest.fn((input) => input),
      save: jest.fn(),
      remove: jest.fn(),
    };
    const service = new ExportTemplatesService(
      templateRepo as never,
      { createQueryBuilder: jest.fn(() => qb), findOne: jest.fn() } as never,
      { create: jest.fn((input) => input), save: jest.fn(async (input) => input) } as never,
      { find: jest.fn(async () => []) } as never,
      { saveBuffer: jest.fn() } as never,
    );

    await expect(service.exportDispatchedOrdersAuto(['do-missing-platform'], undefined, { sub: 'admin-1' } as never))
      .rejects.toMatchObject({ status: 400, message: '\u52b3\u52a8\u5408\u540c\u5b50\u5de5\u5355\u7f3a\u5c11\u7535\u5b50\u7b7e\u5e73\u53f0\uff0c\u65e0\u6cd5\u81ea\u52a8\u5339\u914d\u901f\u521b/E\u7b7e\u5b9d\u5bfc\u51fa\u6a21\u677f' });
    expect(templateRepo.findOne).not.toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ moduleCode: 'contract', isShared: true, signPlatform: undefined }),
    }));
  });
});

function makeTemplate(
  id: string,
  templateName: string,
  signPlatform: string,
  fieldList: Array<Record<string, unknown>>,
): ExportTemplate {
  return {
    id,
    templateName,
    moduleCode: 'contract',
    signPlatform,
    fieldList,
    createdBy: 'admin',
    isShared: true,
    createdAt: new Date(),
  } as unknown as ExportTemplate;
}

function makeOrder(id: string, employeeName: string, signPlatform: string): DispatchedOrder {
  return {
    id,
    moduleCode: 'contract',
    visibleFields: ['employee_name', 'id_card_no'],
    handler: null,
    handlerId: null,
    status: 'pending',
    parentOrder: {
      orderNo: `ON-${id}`,
      employeeName,
      employeeIdCard: `ID-${id}`,
      createdBy: 'creator-1',
      creator: { realName: '\u738b\u4e94' },
      extraData: {
        id_card_no: `ID-${id}`,
        esign_platform: signPlatform,
      },
    },
  } as unknown as DispatchedOrder;
}
