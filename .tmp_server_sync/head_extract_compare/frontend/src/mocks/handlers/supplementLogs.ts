import { http } from 'msw';
import { ok } from '../utils';

const now = new Date().toISOString();

const SUPPLEMENT_LOGS = [
  { id: 'sl-1', work_order_id: '1', dispatched_order_id: '70013', field_code: 'bank_name', field_name: '开户银行', old_value: '', new_value: '中国工商银行', supplemented_by: '入职联系专员A', supplemented_at: '2026-05-08T14:00:00Z' },
  { id: 'sl-2', work_order_id: '1', dispatched_order_id: '70013', field_code: 'bank_account', field_name: '银行账号', old_value: '', new_value: '6222021202012345678', supplemented_by: '入职联系专员A', supplemented_at: '2026-05-08T14:05:00Z' },
];

export const supplementHandlers = [
  http.get('/api/dispatched-orders/:id/supplement-logs', async ({ params }) => {
    return ok(SUPPLEMENT_LOGS.filter((l) => l.dispatched_order_id === params.id));
  }),
];
