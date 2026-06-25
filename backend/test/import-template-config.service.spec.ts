import { FieldConfig, FieldType, ImportTemplateField, OrderType } from 'src/entities';
import { ImportTemplateConfigService } from 'src/modules/imports/import-template-config.service';

function field(overrides: Partial<FieldConfig>): FieldConfig {
  return {
    id: overrides.fieldCode ?? 'id',
    fieldCode: overrides.fieldCode ?? 'employee_name',
    fieldName: overrides.fieldName ?? '姓名',
    fieldType: overrides.fieldType ?? FieldType.TEXT,
    isRequired: overrides.isRequired ?? false,
    defaultRequired: overrides.defaultRequired ?? false,
    conditionalRequired: overrides.conditionalRequired ?? null,
    validationRegex: null,
    validationMsg: null,
    dropdownOptions: overrides.dropdownOptions ?? null,
    collectionGroup: null,
    placeholder: null,
    helpText: overrides.helpText ?? null,
    orderType: overrides.orderType ?? OrderType.ONBOARDING,
    businessContext: overrides.businessContext ?? [overrides.orderType ?? OrderType.ONBOARDING],
    displayOrder: overrides.displayOrder ?? 1,
    isActive: overrides.isActive ?? true,
    createdAt: new Date(),
  } as FieldConfig;
}

function templateField(overrides: Partial<ImportTemplateField>): ImportTemplateField {
  return {
    id: overrides.id ?? overrides.fieldCode ?? 'id',
    orderType: overrides.orderType ?? OrderType.ONBOARDING,
    fieldCode: overrides.fieldCode ?? 'employee_name',
    field: undefined as never,
    displayOrder: overrides.displayOrder ?? 1,
    headerAlias: overrides.headerAlias ?? null,
    isRequiredOverride: overrides.isRequiredOverride ?? null,
    isActive: overrides.isActive ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ImportTemplateField;
}

function buildFieldRepo(fields: FieldConfig[]) {
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(fields),
  };
  return {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    qb,
  };
}

function buildTemplateRepo(rows: ImportTemplateField[] = []) {
  const store = [...rows];
  return {
    find: jest.fn().mockImplementation(({ where }: { where: Partial<ImportTemplateField> }) => Promise.resolve(store.filter((row) => {
      if (where.orderType && row.orderType !== where.orderType) return false;
      if (where.isActive !== undefined && row.isActive !== where.isActive) return false;
      return true;
    }))),
    create: jest.fn((payload) => payload),
    save: jest.fn(async (row: ImportTemplateField) => {
      const existing = store.find((item) => item.orderType === row.orderType && item.fieldCode === row.fieldCode);
      if (existing) Object.assign(existing, row);
      else store.push({ ...row, id: row.id ?? row.fieldCode } as ImportTemplateField);
      return row;
    }),
    store,
  };
}

function buildService(fields: FieldConfig[], rows: ImportTemplateField[] = []) {
  const fieldRepo = buildFieldRepo(fields);
  const templateRepo = buildTemplateRepo(rows);
  const service = new ImportTemplateConfigService(fieldRepo as never, templateRepo as never);
  return { service, fieldRepo, templateRepo };
}

describe('ImportTemplateConfigService', () => {
  const onboardingFields = [
    field({ fieldCode: 'employee_name', fieldName: '姓名', isRequired: true, displayOrder: 1 }),
    field({ fieldCode: 'contract_template', fieldName: '劳动合同模板', conditionalRequired: { field: 'need_company_contract', op: 'EQ', value: '1.是' }, displayOrder: 2 }),
    field({ fieldCode: 'contract_feedback', fieldName: '劳动合同新签反馈', displayOrder: 3 }),
    field({ fieldCode: 'feedback_deadline', fieldName: '反馈截止日期', displayOrder: 4 }),
    field({ fieldCode: 'template_name', fieldName: '模板名称', displayOrder: 5 }),
  ];

  it('falls back to active onboarding fields while excluding downstream-only import fields', async () => {
    const { service } = buildService(onboardingFields);

    const list = await service.list(OrderType.ONBOARDING);

    expect(list.map((item) => item.fieldCode)).toEqual(['employee_name', 'contract_template', 'feedback_deadline', 'template_name']);
    expect(list.find((item) => item.fieldCode === 'contract_template')?.conditionalRequired).toEqual({ field: 'need_company_contract', op: 'EQ', value: '1.是' });
    expect(list.every((item) => item.source === 'fallback')).toBe(true);
  });

  it('returns allowed available fields without downstream feedback fields but keeps contract_template', async () => {
    const { service } = buildService(onboardingFields);

    const available = await service.listAvailableFields(OrderType.ONBOARDING);

    expect(available.map((item) => item.fieldCode)).toContain('contract_template');
    expect(available.map((item) => item.fieldCode)).not.toContain('contract_feedback');
  });

  it('uses configured rows, aliases and required override before fallback', async () => {
    const { service } = buildService(onboardingFields, [
      templateField({ fieldCode: 'template_name', displayOrder: 1, headerAlias: '通用模板名称', isRequiredOverride: true }),
      templateField({ fieldCode: 'employee_name', displayOrder: 2 }),
    ]);

    const list = await service.list(OrderType.ONBOARDING);

    expect(list.map((item) => item.fieldCode)).toEqual(['template_name', 'employee_name']);
    expect(list[0]).toEqual(expect.objectContaining({ headerAlias: '通用模板名称', isRequiredOverride: true, isRequired: true, source: 'configured' }));
  });

  it('rejects replacing with excluded or unavailable fields', async () => {
    const { service } = buildService(onboardingFields);

    await expect(service.replace(OrderType.ONBOARDING, [{ fieldCode: 'contract_feedback' }])).rejects.toBeDefined();
  });

  it('replaces configured fields and deactivates removed rows', async () => {
    const { service, templateRepo } = buildService(onboardingFields, [
      templateField({ fieldCode: 'employee_name', displayOrder: 1 }),
      templateField({ fieldCode: 'feedback_deadline', displayOrder: 2 }),
    ]);

    const result = await service.replace(OrderType.ONBOARDING, [
      { fieldCode: 'template_name', displayOrder: 1, headerAlias: '模板名', isRequiredOverride: false },
    ]);

    expect(result.affected).toBe(1);
    expect(templateRepo.store.find((row) => row.fieldCode === 'employee_name')?.isActive).toBe(false);
    expect(templateRepo.store.find((row) => row.fieldCode === 'feedback_deadline')?.isActive).toBe(false);
    expect(templateRepo.store.find((row) => row.fieldCode === 'template_name')).toEqual(expect.objectContaining({ headerAlias: '模板名', isRequiredOverride: false, isActive: true }));
  });

  it('clears built-in conditionalRequired when admin sets explicit isRequiredOverride=false', async () => {
    const { service } = buildService(onboardingFields, [
      templateField({ fieldCode: 'feedback_deadline', displayOrder: 1, isRequiredOverride: false }),
    ]);

    const list = await service.list(OrderType.ONBOARDING);
    const fd = list.find((item) => item.fieldCode === 'feedback_deadline');

    expect(fd?.isRequired).toBe(false);
    expect(fd?.conditionalRequired).toBeNull();
  });

  it('flips template_name condition to require it when is_common_template is 否 (方案A)', async () => {
    const { service } = buildService(onboardingFields);

    const list = await service.list(OrderType.ONBOARDING);
    const tpl = list.find((item) => item.fieldCode === 'template_name');

    expect(tpl?.conditionalRequired).toEqual({
      op: 'AND',
      children: [
        { field: 'need_onboarding_contact', op: 'EQ', value: '是' },
        { field: 'is_common_template', op: 'EQ', value: '否' },
      ],
    });
  });
});
