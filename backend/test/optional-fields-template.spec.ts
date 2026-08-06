import { Test, TestingModule } from '@nestjs/testing';
import { ImportTemplateService } from 'src/modules/imports/import-template.service';
import { ImportTemplateConfigService } from 'src/modules/imports/import-template-config.service';
import { FieldConfig, OrderType } from 'src/entities';
import * as ExcelJS from 'exceljs';

describe('可选字段模板生成测试', () => {
  let service: ImportTemplateService;
  let configService: ImportTemplateConfigService;

  const mockStandardFields = [
    { fieldCode: 'employee_name', fieldName: '姓名', fieldType: 'text', isIncludedInTemplate: true, isActive: true, displayOrder: 1 },
    { fieldCode: 'id_card_no', fieldName: '身份证号', fieldType: 'text', isIncludedInTemplate: true, isActive: true, displayOrder: 2 },
    { fieldCode: 'mobile', fieldName: '手机号', fieldType: 'text', isIncludedInTemplate: true, isActive: true, displayOrder: 3 },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportTemplateService,
        {
          provide: ImportTemplateConfigService,
          useValue: {
            list: jest.fn().mockResolvedValue(mockStandardFields),
          },
        },
      ],
    }).compile();

    service = module.get<ImportTemplateService>(ImportTemplateService);
    configService = module.get<ImportTemplateConfigService>(ImportTemplateConfigService);
  });

  describe('生成入职工单导入模板', () => {
    it('应返回Excel Buffer和字段数', async () => {
      const result = await service.generate(OrderType.ONBOARDING);

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(0);
      expect(result.fieldCount).toBe(3);
      expect(result.fileName).toBe('工单管理系统-入职导入模板.xlsx');
    });

    it('应只包含标准字段（不含学历4字段）', async () => {
      const result = await service.generate(OrderType.ONBOARDING);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer as any);

      const mainSheet = workbook.getWorksheet('当前字段配置');
      expect(mainSheet).toBeDefined();
      if (!mainSheet) return;

      const headerRow = mainSheet.getRow(2);
      const headers = [];
      for (let col = 2; col <= mockStandardFields.length + 1; col++) {
        headers.push(headerRow.getCell(col).value);
      }

      expect(headers).toContain('姓名');
      expect(headers).toContain('身份证号');
      expect(headers).toContain('手机号');
      expect(headers).not.toContain('学历');
      expect(headers).not.toContain('毕业院校');
    });

    it('应调用configService.list加载标准字段', async () => {
      await service.generate(OrderType.ONBOARDING);

      expect(configService.list).toHaveBeenCalledWith(OrderType.ONBOARDING);
    });
  });
});
