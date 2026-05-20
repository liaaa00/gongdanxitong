import { http } from 'msw';
import { ok } from '../utils';

export const aiHandlers = [
  http.post('/api/ai/field-mapping', async () => {
    return ok({
      mapping: { '姓名': 'employee_name', '身份证号': 'id_card_no', '手机号': 'mobile' },
      confidence: 0.92,
      unmappedColumns: [],
    });
  }),
];
