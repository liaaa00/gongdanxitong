import { http } from 'msw';
import { fail, ok } from '../utils';

const dispatchedList = [
  { id: '70011', parent_order_id: '5001', order_no: 'ON20260511001', module_code: 'data_entry', module_name: '增员报岗录入', status: 'pending', handler_id: null, handler_name: null, employee_name: '张伟', customer_name: '示例客户股份有限公司', visible_fields: ['employee_name', 'id_card_no', 'data_entry_feedback'], return_reason: null, dispatched_at: '2026-05-11T09:15:00+08:00', accepted_at: null, completed_at: null, supplementable_fields: ['bank_name', 'bank_account'], created_at: '2026-05-11T09:15:00+08:00' },
  { id: '70013', parent_order_id: '5001', order_no: 'ON20260511001', module_code: 'onboarding_contact', module_name: '入职联系', status: 'pending', handler_id: null, handler_name: null, employee_name: '张伟', customer_name: '示例客户股份有限公司', visible_fields: ['employee_name', 'mobile', 'bank_name', 'bank_account', 'onboarding_feedback'], return_reason: null, dispatched_at: '2026-05-11T09:15:00+08:00', accepted_at: null, completed_at: null, supplementable_fields: ['bank_name', 'bank_account'], created_at: '2026-05-11T09:15:00+08:00' },
  { id: '70014', parent_order_id: '5001', order_no: 'ON20260511001', module_code: 'contract', module_name: '劳动合同新签', status: 'pending', handler_id: null, handler_name: null, employee_name: '张伟', customer_name: '示例客户股份有限公司', visible_fields: ['employee_name', 'contract_subject', 'contract_template', 'contract_feedback'], return_reason: null, dispatched_at: '2026-05-11T09:15:00+08:00', accepted_at: null, completed_at: null, supplementable_fields: [], created_at: '2026-05-11T09:15:00+08:00' },
];

const details: Record<string, Record<string, unknown>> = {
  '70011': {
    id: '70011', module_code: 'data_entry', status: 'pending', parent_order_id: '5001', order_no: 'ON20260511001',
    handler_id: null, handler_name: null, employee_name: '张伟', customer_name: '示例客户股份有限公司',
    visible_fields: ['employee_name', 'id_card_no', 'mobile', 'data_entry_feedback'],
    return_reason: null, dispatched_at: '2026-05-11T09:15:00+08:00', accepted_at: null, completed_at: null,
    supplementable_fields: ['bank_name', 'bank_account'],
    extra_data: { employee_name: '张伟', id_card_no: '330102199001011234', bank_name: '', bank_account: '', data_entry_feedback: '' },
    created_at: '2026-05-11T09:15:00+08:00',
  },
  '70013': {
    id: '70013', module_code: 'onboarding_contact', status: 'pending', parent_order_id: '5001', order_no: 'ON20260511001',
    handler_id: null, handler_name: null, employee_name: '张伟', customer_name: '示例客户股份有限公司',
    visible_fields: ['employee_name', 'mobile', 'bank_name', 'bank_account', 'onboarding_feedback'],
    return_reason: null, dispatched_at: '2026-05-11T09:15:00+08:00', accepted_at: null, completed_at: null,
    supplementable_fields: ['bank_name', 'bank_account'],
    extra_data: { employee_name: '张伟', mobile: '13800138000', bank_name: '', bank_account: '', onboarding_feedback: '' },
    created_at: '2026-05-11T09:15:00+08:00',
  },
  '70014': {
    id: '70014', module_code: 'contract', status: 'pending', parent_order_id: '5001', order_no: 'ON20260511001',
    handler_id: null, handler_name: null, employee_name: '张伟', customer_name: '示例客户股份有限公司',
    visible_fields: ['employee_name', 'contract_subject', 'contract_template', 'contract_feedback'],
    return_reason: null, dispatched_at: '2026-05-11T09:15:00+08:00', accepted_at: null, completed_at: null,
    supplementable_fields: [],
    extra_data: { employee_name: '张伟', contract_subject: '示例企服有限公司', contract_template: '标准', contract_feedback: '' },
    created_at: '2026-05-11T09:15:00+08:00',
  },
};

export const dispatchedOrderHandlers = [
  // List dispatched orders
  http.get('/api/dispatched-orders', async ({ request }) => {
    const url = new URL(request.url);
    let list = [...dispatchedList];
    if (url.searchParams.get('status')) list = list.filter((d) => d.status === url.searchParams.get('status'));
    if (url.searchParams.get('module_code')) list = list.filter((d) => d.module_code === url.searchParams.get('module_code'));
    return ok({ list, page: 1, pageSize: 20, total: list.length, totalPages: 1, success: true });
  }),

  // Get dispatched order detail
  http.get('/api/dispatched-orders/:id', ({ params }) => {
    const detail = details[String(params.id)] ?? details['70011'];
    return ok(detail);
  }),

  // Accept
  http.post('/api/dispatched-orders/:id/accept', ({ params }) => {
    return ok({ id: params.id, status: 'processing', accepted_at: new Date().toISOString(), handler_name: '当前用户' }, '接单成功');
  }),

  // Complete
  http.post('/api/dispatched-orders/:id/complete', ({ params }) => {
    return ok({ id: params.id, status: 'completed', completed_at: new Date().toISOString() }, '子工单已完成');
  }),

  // Return
  http.post('/api/dispatched-orders/:id/return', async ({ params, request }) => {
    const body = await request.json() as { reason?: string; fields?: string[] };
    if (!body.reason) return fail(400, '退回原因必填', 400);
    return ok({ id: params.id, status: 'returned', return_reason: body.reason, returned_fields: body.fields }, '子工单已退回');
  }),

  // Supplement field
  http.post('/api/dispatched-orders/:id/supplement', async () => {
    return ok(null, '字段已补充');
  }),

  // Reassign
  http.post('/api/dispatched-orders/:id/reassign', async ({ params, request }) => {
    const body = await request.json() as { handler_id: string };
    return ok({ id: params.id, handler_id: body.handler_id, handler_name: '新处理人' }, '已重新分派');
  }),
];
