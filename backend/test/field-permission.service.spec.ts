import { FieldPermissionService, FieldViewItem } from 'src/modules/field-permissions/field-permission.service';
import { FieldPermissionMode } from 'src/entities';

const makeService = (): FieldPermissionService =>
  new FieldPermissionService(
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
  );

describe('FieldPermissionService unit tests', () => {
  let service: FieldPermissionService;

  beforeEach(() => {
    service = makeService();
  });

  describe('applyFieldViews', () => {
    const baseField: FieldViewItem = {
      fieldCode: 'employee_name',
      fieldName: '姓名',
      fieldType: 'text',
      value: '张三',
      permission: FieldPermissionMode.VISIBLE,
    };

    it('removes hidden fields', () => {
      const permissions = new Map([
        ['employee_name', FieldPermissionMode.HIDDEN],
      ]);
      const result = service.applyFieldViews([baseField], permissions);
      expect(result).toHaveLength(0);
    });

    it('keeps visible fields unchanged', () => {
      const permissions = new Map([
        ['employee_name', FieldPermissionMode.VISIBLE],
      ]);
      const result = service.applyFieldViews([baseField], permissions);
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe('张三');
      expect(result[0].permission).toBe(FieldPermissionMode.VISIBLE);
    });

    it('marks readonly fields', () => {
      const permissions = new Map([
        ['employee_name', FieldPermissionMode.READONLY],
      ]);
      const result = service.applyFieldViews([baseField], permissions);
      expect(result).toHaveLength(1);
      expect(result[0].permission).toBe(FieldPermissionMode.READONLY);
    });

    it('masks masked fields', () => {
      const idField: FieldViewItem = {
        fieldCode: 'id_card_no',
        fieldName: '身份证号',
        fieldType: 'text',
        value: '110101199001011234',
        permission: FieldPermissionMode.VISIBLE,
      };
      const permissions = new Map([
        ['id_card_no', FieldPermissionMode.MASKED],
      ]);
      const result = service.applyFieldViews([idField], permissions);
      expect(result).toHaveLength(1);
      expect(result[0].permission).toBe(FieldPermissionMode.MASKED);
      expect(result[0].value).not.toBe('110101199001011234');
      expect(String(result[0].value)).toContain('*');
    });

    it('defaults to hidden when field has no permission entry', () => {
      const permissions = new Map<string, FieldPermissionMode>();
      const result = service.applyFieldViews([baseField], permissions);
      expect(result).toHaveLength(0);
    });

    it('handles multiple fields with mixed permissions', () => {
      const fields: FieldViewItem[] = [
        { ...baseField, fieldCode: 'f1', value: 'v1' },
        { ...baseField, fieldCode: 'f2', value: 'v2' },
        { ...baseField, fieldCode: 'f3', value: 'v3' },
      ];
      const permissions = new Map([
        ['f1', FieldPermissionMode.VISIBLE],
        ['f2', FieldPermissionMode.HIDDEN],
        ['f3', FieldPermissionMode.READONLY],
      ]);
      const result = service.applyFieldViews(fields, permissions);
      expect(result).toHaveLength(2);
      expect(result.map((f) => f.fieldCode)).toEqual(['f1', 'f3']);
    });
  });

  describe('applyExtraData', () => {
    it('excludes hidden fields from output', () => {
      const permissions = new Map([
        ['name', FieldPermissionMode.VISIBLE],
        ['secret', FieldPermissionMode.HIDDEN],
      ]);
      const { data } = service.applyExtraData({ name: 'Alice', secret: 'top' }, permissions);
      expect(data).toHaveProperty('name', 'Alice');
      expect(data).not.toHaveProperty('secret');
    });

    it('collects readonly field codes', () => {
      const permissions = new Map([
        ['name', FieldPermissionMode.READONLY],
        ['age', FieldPermissionMode.VISIBLE],
      ]);
      const { readonlyFields } = service.applyExtraData({ name: 'Alice', age: 30 }, permissions);
      expect(readonlyFields).toContain('name');
      expect(readonlyFields).not.toContain('age');
    });

    it('masks masked fields in extraData', () => {
      const permissions = new Map([
        ['id_card', FieldPermissionMode.MASKED],
      ]);
      const { data } = service.applyExtraData({ id_card: '110101199001011234' }, permissions);
      expect(String(data.id_card)).toContain('*');
    });
  });
});
