import { Workbook } from 'exceljs';
import { ExcelParserService } from 'src/modules/imports/excel-parser.service';
import * as path from 'path';

describe('Imports ExcelParserService', () => {
  it('parses single-row headers without treating the first data row as header', async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('sheet1');
    sheet.addRow(['Customer', 'Code', 'Employee']);
    sheet.addRow(['宁波某制造集团', 'CUST_NB001', '张三']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const service = new ExcelParserService();
    const parsed = await service.parseBuffer(buffer);

    expect(parsed.headers).toEqual(['Customer', 'Code', 'Employee']);
    expect(parsed.meta.headerRows).toBe(1);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].Customer).toBe('宁波某制造集团');
  });

  it('parses merged multi-row headers and data rows', async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('sheet1');
    sheet.getCell('A1').value = 'Basic';
    sheet.getCell('B1').value = 'Basic';
    sheet.getCell('A2').value = 'Name';
    sheet.getCell('B2').value = 'Mobile';
    sheet.getCell('A3').value = 'Alice';
    sheet.getCell('B3').value = '13800138000';
    sheet.mergeCells('A1:B1');
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const service = new ExcelParserService();
    const parsed = await service.parseBuffer(buffer);

    expect(parsed.headers).toEqual(['Basic/Name', 'Basic/Mobile']);
    expect(parsed.meta.headerRows).toBe(2);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]['Basic/Name']).toBe('Alice');
    expect(parsed.rows[0]['Basic/Mobile']).toBe('13800138000');
  });

  it('detects Zhejiang onboarding template field header row and skips instruction rows', async () => {
    const service = new ExcelParserService();
    const parsed = await service.parseFile(path.join(__dirname, '../../tests/zhejiang-qifu-onboarding-template.xlsx'));

    expect(parsed.meta.headerRows).toBe(2);
    expect(parsed.headers).toContain('客户名称');
    expect(parsed.headers).toContain('身份证号码（护照）');
    expect(parsed.headers).toContain('入职材料是否需要集约收集');
    expect(parsed.headers).toContain('数据录入反馈');
    expect(parsed.headers).not.toContain('外服（浙江）企业服务有限公司增员信息表/客户名称');
    expect(parsed.rows).toHaveLength(0);
  });

  it('skips template instruction rows and reads actual rows after Zhejiang template metadata', async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('杭州');
    sheet.getCell('B1').value = '外服（浙江）企业服务有限公司增员信息表';
    sheet.mergeCells('B1:D1');
    sheet.addRow([]);
    sheet.getRow(2).values = ['', '', '客户名称', '客户代码', '姓名', '身份证号码（护照）', '移动电话', '入职材料是否需要集约收集'];
    sheet.getRow(3).values = ['是否必填', '必填', '必填', '必填', '必填', '必填', '必填'];
    sheet.getRow(4).values = ['填写要求', '速创客户简称', '速创客户代码'];
    sheet.getRow(5).values = ['填写示例', '阿里巴巴', 'CH2688', '李田', '430921198702020118', '13277668899', '是'];
    sheet.getRow(6).values = ['备注说明', '客户填or业务员填？'];
    sheet.getRow(7).values = ['涉及工单', '数据录入'];
    sheet.getRow(8).values = ['', '', '真实客户', 'CUST001', '张三', '330106199001010011', '13800138000', '是'];

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const service = new ExcelParserService();
    const parsed = await service.parseBuffer(buffer);

    expect(parsed.headers).toEqual(['__col_1__', '__col_2__', '客户名称', '客户代码', '姓名', '身份证号码（护照）', '移动电话', '入职材料是否需要集约收集']);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]['客户名称']).toBe('真实客户');
    expect(parsed.rows[0]['姓名']).toBe('张三');
    expect(parsed.rows[0]['入职材料是否需要集约收集']).toBe('是');
  });
});
