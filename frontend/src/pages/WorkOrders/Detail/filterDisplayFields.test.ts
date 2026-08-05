import { FieldConfig } from '@/services/fields';

/**
 * 过滤应显示的字段
 * - 标准字段(is_included_in_template !== false)总是显示
 * - 可选字段(is_included_in_template === false)只有值时才显示
 */
function filterDisplayFields(allFields: FieldConfig[], extraData: Record<string, unknown>): FieldConfig[] {
  return allFields.filter((field) => {
    // 标准字段总是显示
    if (field.is_included_in_template !== false) return true;
    // 可选字段只有值时才显示
    const value = extraData[field.field_code];
    return value !== null && value !== undefined && value !== '';
  });
}

describe('filterDisplayFields 前端字段过滤逻辑', () => {
  const mockStandardField: FieldConfig = {
    field_code: 'employee_name',
    field_name: '姓名',
    field_type: 'text',
    is_included_in_template: true,
    is_active: true,
  } as FieldConfig;

  const mockOptionalField: FieldConfig = {
    field_code: 'education',
    field_name: '学历',
    field_type: 'select',
    is_included_in_template: false,
    is_active: true,
  } as FieldConfig;

  const mockStandardFieldUndefined: FieldConfig = {
    field_code: 'mobile',
    field_name: '手机号',
    field_type: 'text',
    is_active: true,
  } as FieldConfig;

  describe('标准字段', () => {
    it('有值时应显示', () => {
      const fields = [mockStandardField];
      const extraData = { employee_name: '张三' };

      const result = filterDisplayFields(fields, extraData);

      expect(result).toHaveLength(1);
      expect(result[0].field_code).toBe('employee_name');
    });

    it('无值时也应显示', () => {
      const fields = [mockStandardField];
      const extraData = {};

      const result = filterDisplayFields(fields, extraData);

      expect(result).toHaveLength(1);
      expect(result[0].field_code).toBe('employee_name');
    });

    it('值为null时也应显示', () => {
      const fields = [mockStandardField];
      const extraData = { employee_name: null };

      const result = filterDisplayFields(fields, extraData);

      expect(result).toHaveLength(1);
    });

    it('值为空字符串时也应显示', () => {
      const fields = [mockStandardField];
      const extraData = { employee_name: '' };

      const result = filterDisplayFields(fields, extraData);

      expect(result).toHaveLength(1);
    });

    it('is_included_in_template为undefined时应视为标准字段', () => {
      const fields = [mockStandardFieldUndefined];
      const extraData = {};

      const result = filterDisplayFields(fields, extraData);

      expect(result).toHaveLength(1);
      expect(result[0].field_code).toBe('mobile');
    });
  });

  describe('可选字段', () => {
    it('有值时应显示', () => {
      const fields = [mockOptionalField];
      const extraData = { education: '本科' };

      const result = filterDisplayFields(fields, extraData);

      expect(result).toHaveLength(1);
      expect(result[0].field_code).toBe('education');
    });

    it('无值时不应显示', () => {
      const fields = [mockOptionalField];
      const extraData = {};

      const result = filterDisplayFields(fields, extraData);

      expect(result).toHaveLength(0);
    });

    it('值为null时不应显示', () => {
      const fields = [mockOptionalField];
      const extraData = { education: null };

      const result = filterDisplayFields(fields, extraData);

      expect(result).toHaveLength(0);
    });

    it('值为undefined时不应显示', () => {
      const fields = [mockOptionalField];
      const extraData = { education: undefined };

      const result = filterDisplayFields(fields, extraData);

      expect(result).toHaveLength(0);
    });

    it('值为空字符串时不应显示', () => {
      const fields = [mockOptionalField];
      const extraData = { education: '' };

      const result = filterDisplayFields(fields, extraData);

      expect(result).toHaveLength(0);
    });

    it('值为0时应显示', () => {
      const fields = [mockOptionalField];
      const extraData = { education: 0 };

      const result = filterDisplayFields(fields, extraData);

      expect(result).toHaveLength(1);
    });

    it('值为false时应显示', () => {
      const fields = [mockOptionalField];
      const extraData = { education: false };

      const result = filterDisplayFields(fields, extraData);

      expect(result).toHaveLength(1);
    });
  });

  describe('混合场景', () => {
    it('标准字段和有值的可选字段都应显示', () => {
      const fields = [mockStandardField, mockOptionalField];
      const extraData = { employee_name: '张三', education: '本科' };

      const result = filterDisplayFields(fields, extraData);

      expect(result).toHaveLength(2);
      expect(result.map(f => f.field_code)).toEqual(['employee_name', 'education']);
    });

    it('标准字段应显示，无值的可选字段不应显示', () => {
      const fields = [mockStandardField, mockOptionalField];
      const extraData = { employee_name: '张三' };

      const result = filterDisplayFields(fields, extraData);

      expect(result).toHaveLength(1);
      expect(result[0].field_code).toBe('employee_name');
    });

    it('多个可选字段，只显示有值的', () => {
      const optionalFields: FieldConfig[] = [
        { ...mockOptionalField, field_code: 'education', field_name: '学历' },
        { ...mockOptionalField, field_code: 'graduation_school', field_name: '毕业院校' },
        { ...mockOptionalField, field_code: 'major', field_name: '专业' },
        { ...mockOptionalField, field_code: 'graduation_date', field_name: '毕业时间' },
      ];
      const extraData = {
        education: '本科',
        graduation_school: '浙江大学',
        // major和graduation_date无值
      };

      const result = filterDisplayFields(optionalFields, extraData);

      expect(result).toHaveLength(2);
      expect(result.map(f => f.field_code)).toEqual(['education', 'graduation_school']);
    });

    it('空字段列表应返回空数组', () => {
      const result = filterDisplayFields([], {});

      expect(result).toHaveLength(0);
    });

    it('空extraData应只保留标准字段', () => {
      const fields = [mockStandardField, mockOptionalField, mockStandardFieldUndefined];
      const extraData = {};

      const result = filterDisplayFields(fields, extraData);

      expect(result).toHaveLength(2);
      expect(result.map(f => f.field_code)).toEqual(['employee_name', 'mobile']);
    });
  });
});
