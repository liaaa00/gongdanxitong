import { AstEvaluator } from 'src/modules/dispatch-engine/ast-evaluator';
import { FieldConfig, FieldType, OrderType } from 'src/entities';
import { ImportFieldValidationService } from 'src/modules/imports/field-validation.service';
import { MappingItemInput } from 'src/modules/imports/types';

function field(input: Partial<FieldConfig>): FieldConfig {
  return {
    id: input.id ?? input.fieldCode ?? 'id',
    fieldCode: input.fieldCode ?? 'need_resignation_cert',
    fieldName: input.fieldName ?? '是否需要开具离职证明',
    fieldType: input.fieldType ?? FieldType.DROPDOWN,
    isRequired: input.isRequired ?? true,
    defaultRequired: input.defaultRequired ?? true,
    conditionalRequired: input.conditionalRequired ?? null,
    validationRegex: null,
    validationMsg: null,
    dropdownOptions: input.dropdownOptions ?? ['是', '否'],
    placeholder: null,
    helpText: null,
    orderType: OrderType.RESIGNATION,
    displayOrder: input.displayOrder ?? 1,
    isActive: true,
    createdAt: new Date(),
  } as FieldConfig;
}

describe('resignation certificate format validation', () => {
  const service = new ImportFieldValidationService({} as never, new AstEvaluator());
  const fields = [
    field({ fieldCode: 'need_resignation_cert' }),
    field({
      fieldCode: 'resignation_cert_format',
      fieldName: '离职证明形式',
      isRequired: false,
      defaultRequired: false,
      dropdownOptions: ['电子证明', '纸质证明'],
      conditionalRequired: { field: 'need_resignation_cert', op: 'EQ', value: '是' },
      displayOrder: 2,
    }),
  ];
  const mapping: MappingItemInput[] = [
    { header: '是否需要开具离职证明', fieldCode: 'need_resignation_cert' },
    { header: '离职证明形式', fieldCode: 'resignation_cert_format' },
  ];

  it('requires the format when a certificate is requested', async () => {
    const result = await service.validateRow({
      rowNo: 1,
      raw: { 是否需要开具离职证明: '是', 离职证明形式: '' },
      mapping,
      fields,
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({
      fieldCode: 'resignation_cert_format',
      reason: 'required',
    }));
  });

  it('allows an empty format when no certificate is requested', async () => {
    const result = await service.validateRow({
      rowNo: 2,
      raw: { 是否需要开具离职证明: '否', 离职证明形式: '' },
      mapping,
      fields,
    });
    expect(result.ok).toBe(true);
  });
});
