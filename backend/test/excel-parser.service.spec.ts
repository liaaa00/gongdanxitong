import { Workbook } from 'exceljs';
import { ExcelParserService } from 'src/modules/imports/excel-parser.service';

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
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('杭州');
    sheet.getCell('B1').value = '外服（浙江）企业服务有限公司增员信息表';
    sheet.mergeCells('B1:D1');
    sheet.getRow(2).values = ['', '', '客户名称', '客户代码', '姓名', '身份证号码（护照）', '移动电话', '入职材料是否需要集约收集', '数据录入反馈'];
    sheet.getRow(3).values = ['是否必填', '必填', '必填', '必填', '必填', '必填', '必填', '选填'];
    sheet.getRow(4).values = ['填写要求', '速创客户简称', '速创客户代码'];
    sheet.getRow(5).values = ['填写示例', '阿里巴巴', 'CH2688', '李田', '430921198702020118', '13277668899', '是', ''];
    sheet.getRow(6).values = ['备注说明', '客户填or业务员填？'];
    sheet.getRow(7).values = ['涉及工单', '数据录入'];
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const service = new ExcelParserService();
    const parsed = await service.parseBuffer(buffer);

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

  it('records 0-based physical row numbers aligned with data rows (attachment anchor alignment)', async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('减员信息表');
    // 模拟离职模板：第1行字段名，2-4行 meta（是否必填/填写要求/填写示例），数据从第5行起
    sheet.getRow(1).values = ['客户名称', '客户代码', '姓名', '身份证号码', '离职日期'];
    sheet.getRow(2).values = ['是否必填', '必填', '必填', '必填', '必填'];
    sheet.getRow(3).values = ['填写要求', '客户简称', '客户代码', '员工姓名', '证件号'];
    sheet.getRow(4).values = ['填写示例', '阿里巴巴', 'CH2688', '李田', '430921198702020118'];
    sheet.getRow(5).values = ['真实客户A', 'CUST001', '张三', '330106199001010011', '2026-06-01'];
    sheet.getRow(6).values = ['真实客户B', 'CUST002', '李四', '330106199002020022', '2026-06-02'];
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const service = new ExcelParserService();
    const parsed = await service.parseBuffer(buffer);

    expect(parsed.rows).toHaveLength(2);
    // 数据在物理第 5、6 行 → 0-based 为 4、5，与嵌入附件 drawing/vml 锚点行号一致
    expect(parsed.meta.rowNumbers).toEqual([4, 5]);
    // 关键：数组下标(0,1) ≠ 物理行号(4,5)，附件必须按 rowNumbers 关联而非数组下标
    expect(parsed.meta.rowNumbers[0]).not.toBe(0);
  });

  it('demotes template label column but keeps attachment column for hyperlink detection', async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('减员信息表');
    // 贴合系统生成的离职模板：A 列为标签列(首行「字段名」)，字段从 B 列起，末列为「附件」提示列
    sheet.getRow(1).values = ['字段名', '客户名称', '姓名', '离职日期', '附件'];
    sheet.getRow(2).values = ['是否必填', '必填', '必填', '必填', '非必填'];
    sheet.getRow(3).values = ['填写要求', '客户简称', '员工姓名', '证件号', '在本行插入附件'];
    sheet.getRow(4).values = ['填写示例', '阿里巴巴', '张三', '2026-06-01', ''];
    sheet.getRow(5).values = ['', '真实客户A', '张三', '2026-06-01', ''];
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const service = new ExcelParserService();
    const parsed = await service.parseBuffer(buffer);

    // The label column is structural; the attachment column stays visible so hyperlinks can be detected.
    expect(parsed.headers).not.toContain('\u5b57\u6bb5\u540d');
    expect(parsed.headers[0]).toMatch(/^__col_\d+__$/);
    expect(parsed.headers).toContain('\u9644\u4ef6');
    // 真实字段表头保留
    expect(parsed.headers).toContain('客户名称');
    expect(parsed.headers).toContain('姓名');
    expect(parsed.headers).toContain('离职日期');
  });

  it('captures hyperlinks from attachment columns with physical row numbers', async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('sheet1');
    sheet.getRow(1).values = ['\u5b57\u6bb5\u540d', 'Name', '\u9644\u4ef6'];
    sheet.getRow(2).values = ['required', 'optional', 'optional'];
    sheet.getRow(3).values = ['Alice', 'Alice', { text: 'proof.pdf', hyperlink: 'https://example.com/proof.pdf' }];
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const service = new ExcelParserService();
    const parsed = await service.parseBuffer(buffer, { headerRows: 1 });

    expect(parsed.headers).toContain('\u9644\u4ef6');
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.meta.attachmentLinks).toEqual([
      {
        rowIndex: 2,
        columnIndex: 2,
        header: '\u9644\u4ef6',
        text: 'proof.pdf',
        hyperlink: 'https://example.com/proof.pdf',
      },
    ]);
  });

});
