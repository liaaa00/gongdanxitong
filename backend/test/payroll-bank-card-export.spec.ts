import { BusinessScope, DispatchedOrder, ExportTemplate } from 'src/entities';
import { ExportTemplatesService } from 'src/modules/admin/export-templates/export-templates.service';

describe('payroll bank card standard export', () => {
  it('fills the clean Beilun workbook without masking the bank account and keeps payroll validation', async () => {
    const service = new ExportTemplatesService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const template = {
      templateName: '薪酬银行卡批导出模板',
      moduleCode: 'payroll_bank_card',
      signPlatform: null,
      businessScope: BusinessScope.BEILUN,
      fieldList: [
        { fieldCode: 'employee_name', order: 1 },
        { fieldCode: 'id_card_no', order: 2 },
        { fieldCode: 'bank_name', order: 3 },
        { fieldCode: 'bank_account', order: 4 },
        { const: '', order: 5 },
        { fieldCode: 'bank_location', order: 6 },
        { const: '', order: 7 },
        { const: '', order: 8 },
        { const: '', order: 9 },
        { fieldCode: 'branch_code', order: 10 },
        { fieldCode: 'payroll_location', order: 11 },
        { const: '', order: 12 },
        { const: '', order: 13 },
      ],
    } as unknown as ExportTemplate;
    const order = {
      moduleCode: 'payroll_bank_card',
      handlerId: null,
      status: 'pending',
      parentOrder: {
        orderNo: 'WO-1',
        employeeName: '张三',
        employeeIdCard: '330200199001010011',
        branchCode: 'BL001',
        extraData: {
          bank_name: '中国银行',
          bank_account: '6222000012345678901',
          bank_location: '宁波',
          payroll_location: '北仑总发薪',
        },
      },
    } as unknown as DispatchedOrder;

    const workbook = await (service as any).tryBuildStandardTemplateWorkbook(template, [order]);
    const cardSheet = workbook.getWorksheet('卡号');

    expect(cardSheet.getCell('A2').value).toBe('张三');
    expect(cardSheet.getCell('B2').value).toBe('330200199001010011');
    expect(cardSheet.getCell('C2').value).toBe('中国银行');
    expect(cardSheet.getCell('D2').value).toBe('6222000012345678901');
    expect(cardSheet.getCell('F2').value).toBe('宁波');
    expect(cardSheet.getCell('J2').value).toBe('BL001');
    expect(cardSheet.getCell('K2').value).toBe('北仑总发薪');
    expect(cardSheet.getCell('K2').dataValidation).toMatchObject({
      type: 'list',
      formulae: ["'卡别'!$A$2:$A$68"],
    });
    expect(workbook.getWorksheet('卡别')).toBeDefined();
  });
});
