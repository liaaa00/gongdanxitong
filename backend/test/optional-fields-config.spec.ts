import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FieldConfig } from 'src/entities';
import { getDatabaseConfig } from './test-helpers';

describe('可选字段配置测试', () => {
  let module: TestingModule;
  let fieldConfigRepo: Repository<FieldConfig>;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(getDatabaseConfig()),
        TypeOrmModule.forFeature([FieldConfig]),
      ],
    }).compile();

    fieldConfigRepo = module.get('FieldConfigRepository');
  });

  afterAll(async () => {
    await module.close();
  });

  describe('字段配置的is_included_in_template属性', () => {
    it('学历4字段应标记为可选字段(is_included_in_template=false)', async () => {
      const educationFields = ['education', 'graduation_school', 'major', 'graduation_date'];

      for (const fieldCode of educationFields) {
        const field = await fieldConfigRepo.findOne({ where: { field_code: fieldCode } });
        expect(field).toBeDefined();
        expect(field.is_included_in_template).toBe(false);
      }
    });

    it('标准字段应标记为包含在模板(is_included_in_template=true或undefined)', async () => {
      const standardFields = ['employee_name', 'id_card_no', 'mobile', 'position'];

      for (const fieldCode of standardFields) {
        const field = await fieldConfigRepo.findOne({ where: { field_code: fieldCode } });
        expect(field).toBeDefined();
        expect(field.is_included_in_template !== false).toBe(true);
      }
    });

    it('查询标准字段时应排除可选字段', async () => {
      const standardFields = await fieldConfigRepo.find({
        where: { is_included_in_template: true },
      });

      const standardFieldCodes = standardFields.map(f => f.field_code);
      expect(standardFieldCodes).not.toContain('education');
      expect(standardFieldCodes).not.toContain('graduation_school');
      expect(standardFieldCodes).not.toContain('major');
      expect(standardFieldCodes).not.toContain('graduation_date');
    });

    it('查询可选字段时应包含学历4字段', async () => {
      const optionalFields = await fieldConfigRepo.find({
        where: { is_included_in_template: false },
      });

      const optionalFieldCodes = optionalFields.map(f => f.field_code);
      expect(optionalFieldCodes).toContain('education');
      expect(optionalFieldCodes).toContain('graduation_school');
      expect(optionalFieldCodes).toContain('major');
      expect(optionalFieldCodes).toContain('graduation_date');
    });

    it('更新字段的is_included_in_template状态应成功', async () => {
      const testField = await fieldConfigRepo.findOne({ where: { field_code: 'remark' } });
      expect(testField).toBeDefined();

      const originalValue = testField.is_included_in_template;
      testField.is_included_in_template = !originalValue;
      await fieldConfigRepo.save(testField);

      const updated = await fieldConfigRepo.findOne({ where: { field_code: 'remark' } });
      expect(updated.is_included_in_template).toBe(!originalValue);

      // 恢复原值
      testField.is_included_in_template = originalValue;
      await fieldConfigRepo.save(testField);
    });
  });
});

