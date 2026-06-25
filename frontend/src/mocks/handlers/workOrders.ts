import { http } from 'msw';
import { ok } from '../utils';

type CreateWorkOrderBody = {
  orderType?: string;
  customerId?: string;
  departmentId?: string;
  extraData?: Record<string, unknown>;
};

const workOrderList = [
  {
    id: '5001', order_no: 'ON20260511001', order_type: 'onboarding', status: 'processing',
    customer_name: '示例客户股份有限公司', employee_name: '张伟', employee_id_card: '330102199001011234',
    created_by: '业务员甲', department_id: '1',
    extra_data: { employee_name: '张伟', id_card_no: '330102199001011234', need_company_contract: '是', need_onboarding_contact: '是' },
    submitted_at: '2026-05-11T09:15:00+08:00', completed_at: null,
    created_at: '2026-05-11T09:00:00+08:00', updated_at: '2026-05-11T09:15:00+08:00',
    dispatched_orders: [
      { id: '70011', module_code: 'data_entry', module_name: '增员报岗录入', status: 'pending', handler_name: '录入员丁', dispatched_at: '2026-05-11T09:15:00+08:00', accepted_at: null, completed_at: null },
      { id: '70013', module_code: 'onboarding_contact', module_name: '入职联系', status: 'pending', handler_name: '联络丙', dispatched_at: '2026-05-11T09:15:00+08:00', accepted_at: null, completed_at: null },
      { id: '70014', module_code: 'contract', module_name: '劳动合同新签', status: 'pending', handler_name: '合同乙', dispatched_at: '2026-05-11T09:15:00+08:00', accepted_at: null, completed_at: null },
    ],
  },
  {
    id: '5002', order_no: 'ON20260510001', order_type: 'onboarding', status: 'completed',
    customer_name: '示例客户股份有限公司', employee_name: '李丽', employee_id_card: '330102199102021234',
    created_by: '业务员甲', department_id: '1',
    extra_data: { employee_name: '李丽', need_company_contract: '否' },
    submitted_at: '2026-05-10T10:00:00+08:00', completed_at: '2026-05-11T15:00:00+08:00',
    created_at: '2026-05-10T09:00:00+08:00', updated_at: '2026-05-11T15:00:00+08:00',
    dispatched_orders: [
      { id: '70021', module_code: 'data_entry', module_name: '增员报岗录入', status: 'completed', handler_name: '录入员丁', dispatched_at: '2026-05-10T10:00:00+08:00', accepted_at: '2026-05-10T11:00:00+08:00', completed_at: '2026-05-11T14:00:00+08:00' },
    ],
  },
  {
    id: '5003', order_no: 'ON20260509001', order_type: 'onboarding', status: 'draft',
    customer_name: '浙江企服', employee_name: '王刚', employee_id_card: '330102199303031234',
    created_by: '业务员甲', department_id: '1',
    extra_data: { employee_name: '王刚', need_company_contract: '否' },
    submitted_at: null, completed_at: null,
    created_at: '2026-05-09T14:00:00+08:00', updated_at: '2026-05-09T14:00:00+08:00',
    dispatched_orders: [],
  },
];

function buildDispatchedOrders(extraData: Record<string, unknown> = {}) {
  const orders = [
    { id: '70011', module_code: 'data_entry', module_name: '增员报岗录入', status: 'pending', handler_name: '录入员丁', dispatched_at: '2026-05-11T09:15:00+08:00', accepted_at: null, completed_at: null },
  ];
  if (extraData.need_onboarding_contact === '是') {
    orders.push({ id: '70013', module_code: 'onboarding_contact', module_name: '入职联系', status: 'pending', handler_name: '联络丙', dispatched_at: '2026-05-11T09:15:00+08:00', accepted_at: null, completed_at: null });
  }
  if (extraData.need_company_contract === '是') {
    orders.push({ id: '70014', module_code: 'contract', module_name: '劳动合同新签', status: 'pending', handler_name: '合同乙', dispatched_at: '2026-05-11T09:15:00+08:00', accepted_at: null, completed_at: null });
  }
  return orders;
}

export const workOrderHandlers = [
  // List work orders
  http.get('/api/work-orders', async ({ request }) => {
    const url = new URL(request.url);
    let list = [...workOrderList];
    if (url.searchParams.get('status')) list = list.filter((w) => w.status === url.searchParams.get('status'));
    if (url.searchParams.get('keyword')) {
      const kw = url.searchParams.get('keyword')!.toLowerCase();
      list = list.filter((w) => w.order_no.toLowerCase().includes(kw) || w.employee_name.toLowerCase().includes(kw));
    }
    return ok({ list, page: 1, pageSize: 20, total: list.length, totalPages: 1, success: true });
  }),

  // Get work order timeline
  http.get('/api/work-orders/:id/timeline', async ({ params }) => {
    const found = workOrderList.find((w) => w.id === params.id) || workOrderList[0];
    const list = [
      {
        id: `timeline-${found.id}-submit`, createdAt: found.submitted_at || found.updated_at, created_at: found.submitted_at || found.updated_at,
        operatorId: null, operator_id: null, operatorName: found.created_by, operator_name: found.created_by, userId: null, user_id: null, userName: found.created_by, user_name: found.created_by,
        entityType: 'work_order', entity_type: 'work_order', entityId: found.id, entity_id: found.id, entityLabel: '主工单', entity_label: '主工单',
        actionCode: 'work_order.submit', action_code: 'work_order.submit', actionType: 'submit', action_type: 'submit', actionLabel: '提交工单', action_label: '提交工单', title: '提交工单', description: '提交主工单并触发派发',
        contextFields: { oldStatus: 'draft', newStatus: found.status }, context_fields: { oldStatus: 'draft', newStatus: found.status }, beforeData: { status: 'draft' }, before_data: { status: 'draft' }, afterData: { status: found.status }, after_data: { status: found.status },
      },
      ...((found.dispatched_orders || []).map((d) => ({
        id: `timeline-${found.id}-${d.id}`, createdAt: d.dispatched_at || found.submitted_at || found.updated_at, created_at: d.dispatched_at || found.submitted_at || found.updated_at,
        operatorId: null, operator_id: null, operatorName: '系统', operator_name: '系统', userId: null, user_id: null, userName: '系统', user_name: '系统',
        entityType: 'dispatched_order', entity_type: 'dispatched_order', entityId: d.id, entity_id: d.id, entityLabel: '子工单', entity_label: '子工单',
        actionCode: 'dispatched_order.dispatched', action_code: 'dispatched_order.dispatched', actionType: 'dispatched', action_type: 'dispatched', actionLabel: '子工单派发', action_label: '子工单派发', title: '子工单派发', description: '主工单派发生成子工单',
        contextFields: { parentOrderId: found.id, dispatchedOrderId: d.id, moduleCode: d.module_code, toUserId: d.handler_name }, context_fields: { parentOrderId: found.id, dispatchedOrderId: d.id, moduleCode: d.module_code, toUserId: d.handler_name }, beforeData: null, before_data: null, afterData: { parentOrderId: found.id, moduleCode: d.module_code, handlerId: d.handler_name }, after_data: { parentOrderId: found.id, moduleCode: d.module_code, handlerId: d.handler_name },
      }))),
      {
        id: `timeline-${found.id}-create`, createdAt: found.created_at, created_at: found.created_at,
        operatorId: null, operator_id: null, operatorName: found.created_by, operator_name: found.created_by, userId: null, user_id: null, userName: found.created_by, user_name: found.created_by,
        entityType: 'work_order', entity_type: 'work_order', entityId: found.id, entity_id: found.id, entityLabel: '主工单', entity_label: '主工单',
        actionCode: 'work_order.create_draft', action_code: 'work_order.create_draft', actionType: 'create_draft', action_type: 'create_draft', actionLabel: '创建工单', action_label: '创建工单', title: '创建工单', description: '创建主工单草稿',
        contextFields: { newStatus: 'draft', createdBy: found.created_by }, context_fields: { newStatus: 'draft', createdBy: found.created_by }, beforeData: null, before_data: null, afterData: { status: 'draft' }, after_data: { status: 'draft' },
      },
    ].filter((item) => Boolean(item.createdAt));
    return ok({ items: list, list, timeline: list, total: list.length });
  }),

  // Get single work order
  http.get('/api/work-orders/:id', async ({ params }) => {
    const found = workOrderList.find((w) => w.id === params.id) || workOrderList[0];
    return ok(found);
  }),

  // Create work order
  http.post('/api/work-orders', async ({ request }) => {
    const body = await request.json() as CreateWorkOrderBody;
    const isSubmit = (body.extraData?._action as string) === 'submit';
    return ok({
      ...workOrderList[0],
      id: String(Date.now()),
      order_no: 'ON' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '001',
      order_type: body.orderType ?? 'onboarding',
      status: isSubmit ? 'processing' : 'draft',
      extra_data: body.extraData || {},
      submitted_at: isSubmit ? new Date().toISOString() : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      dispatched_orders: isSubmit ? buildDispatchedOrders(body.extraData || {}) : [],
    }, isSubmit ? '工单已提交并派发' : '草稿已保存');
  }),

  // Submit work order
  http.post('/api/work-orders/:id/submit', async ({ params }) => {
    const found = workOrderList.find((w) => w.id === params.id) || workOrderList[0];
    const dispatchedOrders = buildDispatchedOrders({ need_company_contract: '是', need_onboarding_contact: '是' });
    return ok({
      ...found,
      id: params.id,
      status: 'processing',
      submitted_at: new Date().toISOString(),
      dispatched_orders: dispatchedOrders,
    }, '工单已派发，共生成 ' + dispatchedOrders.length + ' 个子工单');
  }),

  // Resubmit work order
  http.post('/api/work-orders/:id/resubmit', async ({ params }) => {
    const found = workOrderList.find((w) => w.id === params.id) || workOrderList[0];
    return ok({
      ...found, status: 'processing',
      dispatched_orders: (found.dispatched_orders || []).map((d) =>
        d.status === 'returned' ? { ...d, status: 'pending', return_reason: undefined } : d),
      updated_at: new Date().toISOString(),
    }, '已重新提交');
  }),
];
