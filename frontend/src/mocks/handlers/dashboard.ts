import { http } from 'msw';
import { ok } from '../utils';

export const dashboardHandlers = [
  http.get('/api/dashboard/salesperson', async () => {
    return ok({
      total_orders: 25, pending_orders: 5, processing_orders: 12, completed_orders: 8, returned_orders: 0,
      last_month_total: 30, last_month_completed: 22,
      monthly_trend: [
        { month: '1月', total: 18, completed: 14 }, { month: '2月', total: 15, completed: 11 },
        { month: '3月', total: 22, completed: 18 }, { month: '4月', total: 30, completed: 22 },
        { month: '5月', total: 25, completed: 8 },
      ],
      recent_orders: [{ id: '1', order_no: 'ON20260508001', employee_name: '张三', status: 'processing', created_at: new Date().toISOString() }],
      top_customers: [{ customer_name: '浙江企服', count: 12 }, { customer_name: '杭州科技', count: 8 }],
    });
  }),

  http.get('/api/dashboard/team/:module', async () => {
    return ok({
      module_code: 'contract', module_name: '劳动合同新签',
      total_pending: 10, total_processing: 5, completed_today: 3, completed_this_month: 42,
      avg_processing_hours: 4.5,
      trend: [
        { date: '05/05', completed: 5 }, { date: '05/06', completed: 8 },
        { date: '05/07', completed: 6 }, { date: '05/08', completed: 9 },
        { date: '05/09', completed: 7 }, { date: '05/10', completed: 4 },
        { date: '05/11', completed: 3 },
      ],
      members: [
        { user_id: 'u1', user_name: '专员A', pending_count: 3, processing_count: 2, completed_today: 1 },
        { user_id: 'u2', user_name: '专员B', pending_count: 5, processing_count: 1, completed_today: 0 },
      ],
    });
  }),

  http.get('/api/dashboard/manager', async () => {
    return ok({
      total_onboarding: 100, completed_onboarding: 60, total_this_month: 35, completed_this_month: 18,
      completion_rate: 51.4,
      monthly_trend: [
        { month: '1月', total: 80, completed: 65 }, { month: '2月', total: 75, completed: 58 },
        { month: '3月', total: 90, completed: 72 }, { month: '4月', total: 95, completed: 68 },
        { month: '5月', total: 35, completed: 18 },
      ],
      by_module: [
        { module_code: 'contract', module_name: '劳动合同新签', pending: 5, processing: 8, completed: 20 },
        { module_code: 'onboarding_contact', module_name: '入职联系', pending: 3, processing: 5, completed: 12 },
        { module_code: 'data_entry', module_name: '增员报岗录入', pending: 10, processing: 5, completed: 18 },
      ],
      by_salesperson: [
        { user_id: 's1', user_name: '业务员A', total: 15, completed: 8, processing: 5 },
        { user_id: 's2', user_name: '业务员B', total: 12, completed: 6, processing: 4 },
        { user_id: 's3', user_name: '业务员C', total: 8, completed: 4, processing: 3 },
      ],
      sla_breach_count: 3,
    });
  }),
];
