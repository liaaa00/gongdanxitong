import { http } from 'msw';
import { ok } from '../utils';

export const importHandlers = [
  http.post('/api/work-orders/import/preview', async () => {
    return ok({
      mapping: [
        { excelColumn: '姓名', systemFieldCode: 'employee_name', systemFieldName: '姓名', confidence: 0.98 },
        { excelColumn: '身份证号', systemFieldCode: 'id_card_no', systemFieldName: '身份证号', confidence: 0.95 },
        { excelColumn: '手机号', systemFieldCode: 'mobile', systemFieldName: '移动电话', confidence: 0.92 },
        { excelColumn: '客户名称', systemFieldCode: 'customer_name', systemFieldName: '客户名称', confidence: 0.97 },
        { excelColumn: '岗位', systemFieldCode: 'position', systemFieldName: '岗位', confidence: 0.94 },
        { excelColumn: '邮箱', systemFieldCode: 'email', systemFieldName: '电子邮件', confidence: 0.91 },
      ],
      availableFields: [
        { field_code: 'employee_name', field_name: '姓名', is_required: true },
        { field_code: 'id_card_no', field_name: '身份证号', is_required: true },
        { field_code: 'customer_name', field_name: '客户名称', is_required: true },
        { field_code: 'position', field_name: '岗位', is_required: true },
        { field_code: 'mobile', field_name: '移动电话', is_required: true },
        { field_code: 'email', field_name: '电子邮件', is_required: true },
        { field_code: 'current_address', field_name: '现住地址', is_required: true },
      ],
      suggestedMapping: { '姓名': 'employee_name', '身份证号': 'id_card_no', '手机号': 'mobile', '客户名称': 'customer_name', '岗位': 'position', '邮箱': 'email' },
      totalRows: 15,
      previewRows: [{ '姓名': '张三', '身份证号': '330106199001011234', '客户名称': '浙江企服', '岗位': '工程师' }],
      missingRequired: ['current_address', 'social_location'],
    });
  }),

  http.post('/api/work-orders/import/confirm', async () => {
    return ok({
      id: 'job-import-001',
      total_rows: 15,
      success_rows: 12,
      fail_rows: 3,
      processed_rows: 15,
      status: 'completed',
      error_report_url: '/api/files/error-report.xlsx',
      validation_errors: [
        { row: 5, field: 'email', message: '邮箱格式不正确' },
        { row: 9, field: 'id_card_no', message: '身份证号格式不正确' },
        { row: 12, field: 'contract_start_date', message: '合同开始日期不合法' },
      ],
    });
  }),

  http.get('/api/work-orders/import/:jobId', async () => {
    return ok({
      id: 'job-import-001',
      total_rows: 15,
      success_rows: 15,
      fail_rows: 0,
      processed_rows: 15,
      status: 'completed',
      error_report_url: null,
      validation_errors: [],
    });
  }),
];
