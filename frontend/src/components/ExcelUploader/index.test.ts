import { describe, expect, it } from 'vitest';
import {
  getUnresolvedImportHeaders,
  type FieldMappingResult,
  type NewFieldDraft,
} from './index';

const mappingResult = {
  mapping: [
    { excelColumn: '姓名', systemFieldCode: 'employee_name', systemFieldName: '姓名' },
    { excelColumn: '特殊字段', systemFieldCode: '', systemFieldName: '' },
    { excelColumn: '__col_9__', systemFieldCode: '', systemFieldName: '' },
  ],
} as Pick<FieldMappingResult, 'mapping'>;

describe('ExcelUploader mapping guard', () => {
  it('blocks every ordinary header that has not been mapped', () => {
    expect(getUnresolvedImportHeaders(
      mappingResult,
      { 姓名: 'employee_name', 特殊字段: '' },
      {},
      false,
    )).toEqual(['特殊字段']);
  });

  it('allows an administrator to finish a configured new-field mapping', () => {
    const newFields: Record<string, NewFieldDraft> = {
      特殊字段: {
        header: '特殊字段',
        fieldName: '特殊字段',
        fieldType: 'text',
        required: false,
      },
    };
    expect(getUnresolvedImportHeaders(
      mappingResult,
      { 姓名: 'employee_name', 特殊字段: '__NEW_FIELD__' },
      newFields,
      true,
    )).toEqual([]);
    expect(getUnresolvedImportHeaders(
      mappingResult,
      { 姓名: 'employee_name', 特殊字段: '__NEW_FIELD__' },
      newFields,
      false,
    )).toEqual(['特殊字段']);
  });
});
