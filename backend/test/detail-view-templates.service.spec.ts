import { FieldPermissionMode } from 'src/entities';
import { getDetailViewFieldCodes } from 'src/modules/admin/detail-view-templates/detail-view-template-fields';
import { DetailViewTemplatesService } from 'src/modules/admin/detail-view-templates/detail-view-templates.service';

describe('DetailViewTemplatesService contract permissions', () => {
  it('extracts unique field codes from supported detail template keys', () => {
    expect(getDetailViewFieldCodes([
      { fieldCode: 'employee_name' },
      { field_code: 'employee_name' },
      { code: 'mobile' },
      { sameAs: 'id_card_no' },
      { fieldCode: '  ' },
    ])).toEqual(['employee_name', 'mobile', 'id_card_no']);
  });

  it('syncs active contract template fields as editable for business members', async () => {
    const template = {
      id: 'template-1',
      moduleCode: 'contract',
      templateName: '劳动合同',
      fieldList: [{ fieldCode: 'employee_name' }, { field_code: 'special_remark' }],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const templateRepo = {
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue(template),
      findOne: jest.fn().mockResolvedValue(template),
    };
    const roleRepo = {
      find: jest.fn().mockResolvedValue([{ id: 'role-biz', code: 'biz_member' }]),
    };
    const fieldConfigRepo = {
      find: jest.fn().mockResolvedValue([
        { fieldCode: 'employee_name', isActive: true },
        { fieldCode: 'special_remark', isActive: true },
        { fieldCode: 'bank_name', isActive: true },
      ]),
    };
    const fieldPermissionRepo = { upsert: jest.fn().mockResolvedValue(undefined) };
    const service = new DetailViewTemplatesService(
      templateRepo as any,
      roleRepo as any,
      fieldConfigRepo as any,
      fieldPermissionRepo as any,
    );

    await service.create({
      templateName: '劳动合同',
      moduleCode: 'contract',
      fieldList: template.fieldList,
      isActive: true,
    });

    expect(fieldPermissionRepo.upsert).toHaveBeenCalledWith([
      {
        roleId: 'role-biz',
        fieldCode: 'employee_name',
        scenario: 'dispatched:contract',
        permission: FieldPermissionMode.VISIBLE,
      },
      {
        roleId: 'role-biz',
        fieldCode: 'special_remark',
        scenario: 'dispatched:contract',
        permission: FieldPermissionMode.VISIBLE,
      },
      {
        roleId: 'role-biz',
        fieldCode: 'bank_name',
        scenario: 'dispatched:contract',
        permission: FieldPermissionMode.HIDDEN,
      },
    ], ['roleId', 'fieldCode', 'scenario']);
  });
});
