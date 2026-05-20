import request from './request';
import { isMockMode, mockDelay } from './mock';

export interface SupplementLogItem {
  id: string;
  work_order_id: string;
  dispatched_order_id: string;
  field_code: string;
  field_name: string;
  old_value: string;
  new_value: string;
  supplemented_by: string;
  supplemented_at: string;
}

const mockLogs: SupplementLogItem[] = [
  { id: 'sl-1', work_order_id: '1', dispatched_order_id: 'd4', field_code: 'bank_name', field_name: '开户银行', old_value: '', new_value: '中国工商银行', supplemented_by: '入职联系专员A', supplemented_at: '2026-05-08T14:00:00Z' },
  { id: 'sl-2', work_order_id: '1', dispatched_order_id: 'd4', field_code: 'bank_account', field_name: '银行账号', old_value: '', new_value: '6222021202012345678', supplemented_by: '入职联系专员A', supplemented_at: '2026-05-08T14:05:00Z' },
];

export async function getSupplementLogs(dispatchedOrderId: string): Promise<SupplementLogItem[]> {
  if (isMockMode) {
    const filtered = mockLogs.filter((l) => l.dispatched_order_id === dispatchedOrderId);
    return mockDelay(filtered);
  }
  return request.get(`/dispatched-orders/${dispatchedOrderId}/supplement-logs`) as Promise<SupplementLogItem[]>;
}
