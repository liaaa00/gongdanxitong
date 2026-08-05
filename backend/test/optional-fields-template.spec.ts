import { Test, TestingModule } from '@nestjs/testing';
import { ImportTemplateService } from 'src/modules/imports/import-template.service';
import { ImportTemplateConfigService } from 'src/modules/imports/import-template-config.service';
import { FieldConfig } from 'src/entities';
import * as XLSX from 'xlsx';

describe('可选字段模板生成测试', () => {
  let service: ImportTemplateService;
  let configService: ImportTemplateConfigService;

  const mockStandardFields: Partial<FieldConfig>[] = [
    { field_code: 'employee_name', field_name: '姓名', is_included_in_template: true },
    { field_code: 'id_card_no', field_name: '身份证号', is_included_in_template: true },
    { field_code: 'mobile', field_name: '手机号', is_included_in_template: true },
  ];

  const mockOptionalFields: Partial<FieldConfig>[] = [
    { field_code: 'education', field_name: '学历', field_type: 'select', is_included_in_template: false },
    { field_code: 'graduation_school', field_name: '毕业院校', field_type: 'text', is_included_in_template: false },
    { field_code: 'major', field_name: '专业', field_type: 'text', is_included_in_template: false },
    { field_code: 'graduation_date', field_name: '毕业时间', field_type: 'date', is_included_in_template: false },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportTemplateService,
        {
          provide: ImportTemplateConfigService,
          useValue: {
            loadActiveFields: jest.fn().mockResolvedValue(mockStandardFields),
            listOptionalFields: jest.fn().mockResolvedValue(mockOptionalFields),
          },
        },
      ],
    }).compile();

    service = module.get<ImportTemplateService>(ImportTemplateService);
    configService = module.get<ImportTemplateConfigService>(ImportTemplateConfigService);
  });

  describe('生成入职工单导入模板', () => {
    it('应返回Excel Buffer', async () => {
      const buffer = await service.generate('onboarding');

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('应包含2个工作表', async () => {
      const buffer = await service.generate('onboarding');
      const workbook = XLSX.read(buffer, { type: 'buffer' });

      expect(workbook.SheetNames.length).toBe(2);
      expect(workbook.SheetNames[0]).toBe('导入数据');
      expect(workbook.SheetNames[1]).toBe('可选字段说明');
    });

    it('第一个工作表应只包含标准字段', async () => {
      const buffer = await service.generate('onboarding');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet1 = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet1, { header: 1 }) as string[][];

      const headers = data[0];
      expect(headers).toContain('姓名');
      expect(headers).toContain('身份证号');
      expect(headers).toContain('手机号');
      expect(headers).not.toContain('学历');
      expect(headers).not.toContain('毕业院校');
    });

    it('第二个工作表应包含可选字段说明', async () => {
      const buffer = await service.generate('onboarding');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet2 = workbook.Sheets[workbook.SheetNames[1]];
      const data = XLSX.utils.sheet_to_json(sheet2, { header: 1 }) as string[][];

      const headers = data[0];
      expect(headers).toContain('列名');
      expect(headers).toContain('字段说明');
      expect(headers).toContain('数据类型');
      expect(headers).toContain('示例值');

      const dataRows = data.slice(1);
      const fieldNames = dataRows.map(row => row[0]);
      expect(fieldNames).toContain('学历');
      expect(fieldNames).toContain('毕业院校');
      expect(fieldNames).toContain('专业');
      expect(fieldNames).toContain('毕业时间');
    });

    it('可选字段说明应包含完整信息', async () => {
      const buffer = await service.generate('onboarding');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet2 = workbook.Sheets[workbook.SheetNames[1]];
      const data = XLSX.utils.sheet_to_json(sheet2, { header: 1 }) as string[][];

      const educationRow = data.find(row => row[0] === '学历');
      expect(educationRow).toBeDefined();
      expect(educationRow[1]).toBe('学历');
      expect(educationRow[2]).toContain('下拉');
      expect(educationRow[3]).toBeTruthy();
    });

    it('应调用configService加载标准字段和可选字段', async () => {
      await service.generate('onboarding');

      expect(configService.loadActiveFields).toHaveBeenCalledWith('onboarding');
      expect(configService.listOptionalFields).toHaveBeenCalledWith('onboarding');
    });
  });
});
