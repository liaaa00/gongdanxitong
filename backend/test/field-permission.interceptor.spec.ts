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
});
