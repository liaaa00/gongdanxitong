import { FieldPermissionInterceptor } from 'src/modules/field-permissions/field-permission.interceptor';
import { FieldPermissionService } from 'src/modules/field-permissions/field-permission.service';
import { FieldPermissionMode } from 'src/entities';

const makeService = (): FieldPermissionService =>
  new FieldPermissionService(
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
  );

describe('FieldPermissionInterceptor pending modify aliases', () => {
  it('filters and masks both formal and pending field aliases', () => {
    const interceptor = new FieldPermissionInterceptor({} as never, makeService());
    const permissions = new Map([
      ['employee_name', FieldPermissionMode.VISIBLE],
      ['base_salary', FieldPermissionMode.MASKED],
      ['secret_note', FieldPermissionMode.HIDDEN],
    ]);
    const rawFields = {
      employee_name: '张三',
      base_salary: '¥2,600.00',
      secret_note: '不可见',
    };
    const pending = {
      fields: {
        employee_name: '李四',
        base_salary: '¥3,000.00',
        secret_note: '仍不可见',
      },
      reason: '修正入职信息',
    };

    const result = (interceptor as unknown as {
      applyPayload: (payload: unknown, fieldPermissions: Map<string, FieldPermissionMode>, depth: number) => any;
    }).applyPayload({
      extraData: rawFields,
      extra_data: rawFields,
      pendingModify: pending,
      pending_modify: pending,
    }, permissions, 0);

    expect(result.extraData.employee_name).toBe('张三');
    expect(result.extra_data).toEqual(result.extraData);
    expect(String(result.extraData.base_salary)).toContain('*');
    expect(result.extraData).not.toHaveProperty('secret_note');

    expect(result.pendingModify.reason).toBe('修正入职信息');
    expect(result.pending_modify).toEqual(result.pendingModify);
    expect(result.pendingModify.fields.employee_name).toBe('李四');
    expect(String(result.pendingModify.fields.base_salary)).toContain('*');
    expect(result.pendingModify.fields).not.toHaveProperty('secret_note');
  });

  it('keeps template-configured hidden detail fields readonly while hiding fields outside the template', () => {
    const interceptor = new FieldPermissionInterceptor({} as never, makeService());
    const permissions = new Map([
      ['resignation_cert_format', FieldPermissionMode.HIDDEN],
      ['secret_note', FieldPermissionMode.HIDDEN],
    ]);

    const result = (interceptor as unknown as {
      applyPayload: (payload: unknown, fieldPermissions: Map<string, FieldPermissionMode>, depth: number) => any;
    }).applyPayload({
      _detailTemplateFieldCodes: ['resignation_cert_format'],
      extraData: { resignation_cert_format: '电子证明', secret_note: '不可见' },
      fields: [
        { fieldCode: 'resignation_cert_format', fieldName: '离职证明形式', fieldType: 'dropdown', value: '电子证明', permission: FieldPermissionMode.HIDDEN },
        { fieldCode: 'secret_note', fieldName: '内部备注', fieldType: 'text', value: '不可见', permission: FieldPermissionMode.HIDDEN },
      ],
    }, permissions, 0);

    expect(result).not.toHaveProperty('_detailTemplateFieldCodes');
    expect(result.extraData).toEqual({ resignation_cert_format: '电子证明' });
    expect(result.readonlyFields).toEqual(['resignation_cert_format']);
    expect(result._fieldPermissions).toMatchObject({ resignation_cert_format: FieldPermissionMode.READONLY, secret_note: FieldPermissionMode.HIDDEN });
    expect(result.fields).toEqual([expect.objectContaining({
      fieldCode: 'resignation_cert_format',
      permission: FieldPermissionMode.READONLY,
      value: '电子证明',
    })]);
  });

  it('keeps certificate order extraData camelCase fields visible as readonly instead of wiping them', () => {
    const interceptor = new FieldPermissionInterceptor({} as never, makeService());
    const permissions = new Map([
      ['certificate_type', FieldPermissionMode.VISIBLE],
      ['secret_note', FieldPermissionMode.HIDDEN],
    ]);

    const result = (interceptor as unknown as {
      applyPayload: (payload: unknown, fieldPermissions: Map<string, FieldPermissionMode>, depth: number) => any;
    }).applyPayload({
      orderKind: 'certificate',
      extraData: {
        certificateType: 'employment',
        certificateFormat: '纸质证明',
        mailingAddress: '上海市黄浦区南京东路100号',
        contactName: '张三',
        contactPhone: '13800138000',
        purpose: 'E2E测试',
        secret_note: '不可见',
      },
    }, permissions, 0);

    expect(result.extraData.certificateType).toBe('employment');
    expect(result.extraData.certificateFormat).toBe('纸质证明');
    expect(result.extraData.mailingAddress).toBe('上海市黄浦区南京东路100号');
    expect(result.extraData.contactName).toBe('张三');
    expect(result.extraData.contactPhone).toBe('13800138000');
    expect(result.extraData.purpose).toBe('E2E测试');
    expect(result.extraData).not.toHaveProperty('secret_note');
    expect(result.readonlyFields).toContain('certificateFormat');
    expect(result._fieldPermissions.certificateFormat).toBe(FieldPermissionMode.READONLY);
  });

  it('still hides certificate extraData fields when the permission row explicitly hides them', () => {
    const interceptor = new FieldPermissionInterceptor({} as never, makeService());
    const permissions = new Map([
      ['certificateFormat', FieldPermissionMode.HIDDEN],
    ]);

    const result = (interceptor as unknown as {
      applyPayload: (payload: unknown, fieldPermissions: Map<string, FieldPermissionMode>, depth: number) => any;
    }).applyPayload({
      orderKind: 'certificate',
      extraData: { certificateFormat: '纸质证明' },
    }, permissions, 0);

    expect(result.extraData).toEqual({});
  });
});
