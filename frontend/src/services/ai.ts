import request from './request';
import { isMockMode, mockDelay } from './mock';

export interface FieldMappingResult {
  mapping: Record<string, string>;
  confidence: Record<string, number>;
  unmappedColumns: string[];
  suggestions: {
    excel_column: string;
    candidates: { field_code: string; field_name: string; score: number }[];
  }[];
}

const mockMapping: FieldMappingResult = {
  mapping: {
    '姓名': 'employee_name',
    '身份证号': 'id_card_no',
    '手机号': 'mobile',
  },
  confidence: {
    '姓名': 0.95,
    '身份证号': 0.92,
    '手机号': 0.88,
  },
  unmappedColumns: ['备注列'],
  suggestions: [
    {
      excel_column: '备注列',
      candidates: [
        { field_code: 'remark', field_name: '备注', score: 0.7 },
        { field_code: 'special_remark', field_name: '特殊备注', score: 0.5 },
      ],
    },
  ],
};

export async function getFieldMappingSuggestions(headers: string[]): Promise<FieldMappingResult> {
  if (isMockMode) return mockDelay(mockMapping, 600);
  return request.post('/ai/field-mapping', { headers }) as Promise<FieldMappingResult>;
}
