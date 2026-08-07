import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IN_SERVICE_BUSINESS_TYPE_MAPPING,
  IN_SERVICE_ORDER_KINDS,
  IN_SERVICE_PROCESS_TYPE_MAPPING,
  PROVINCES_27,
  getInServiceCategoryPath,
  getInServiceProcessOptions,
  getInServiceRequirementOptions,
} from '@/constants/inService';
import { buildBatchRenewalRows, buildInServiceListQuery, flattenDepartments, getInServiceStatusValueEnum } from './index';
import {
  acceptInServiceOrder,
  confirmInServiceOrder,
  createInServiceOrder,
  failInServiceOrder,
  getInServiceOrder,
  requestInServiceOrderInfo,
  resubmitInServiceOrder,
  startInServiceProcessing,
} from '@/services/inServiceOrders';

describe('single-business category contract', () => {
  it('matches the Excel category and province sources', () => {
    expect(Object.keys(IN_SERVICE_BUSINESS_TYPE_MAPPING)).toEqual([
      'registration', 'benefit', 'subsidy', 'other',
    ]);
    expect(Object.keys(IN_SERVICE_PROCESS_TYPE_MAPPING)).toHaveLength(19);
    expect(PROVINCES_27).toHaveLength(27);
    expect(PROVINCES_27).toContain('新疆');
    expect(PROVINCES_27).toContain('宁夏');
    expect(PROVINCES_27).not.toContain('浙江');
    expect(PROVINCES_27).not.toContain('青海');
  });

  it('only requires level 3 for the three configured level-2 categories', () => {
    expect(getInServiceProcessOptions('registration')).toHaveLength(6);
    expect(getInServiceRequirementOptions('enterprise_account')).toEqual([]);
    expect(getInServiceRequirementOptions('supplementary_payment').map((item) => item.value)).toEqual([
      'unpaid_supplement', 'base_difference_supplement',
    ]);
    expect(getInServiceCategoryPath('registration', 'supplementary_payment', 'unpaid_supplement'))
      .toBe('参保登记类 / 补缴 / 应缴未缴补缴');
  });

  it('converts ProTable pagination and date range to backend list query', () => {
    const query = buildInServiceListQuery({
      current: 3,
      pageSize: 50,
      province: '江苏',
      status: 'processing',
      businessType: 'registration',
      createdAt: ['2026-07-01', '2026-07-31'],
    });
    expect(query).toMatchObject({
      page: 3,
      pageSize: 50,
      province: '江苏',
      status: 'processing',
      businessType: 'registration',
    });
    expect(query.createdFrom).toContain('2026-06-30T16:00:00.000Z');
    expect(query.createdTo).toContain('2026-07-31T15:59:59.999Z');
  });

  it('uses exactly four user-facing states for certificate lists', () => {
    const certificateStatuses = getInServiceStatusValueEnum(IN_SERVICE_ORDER_KINDS.CERTIFICATE);
    expect(Object.keys(certificateStatuses)).toEqual([
      'dispatched',
      'processing',
      'completed',
      'pending_info',
    ]);
    expect(certificateStatuses).toMatchObject({
      dispatched: { text: '待开具' },
      processing: { text: '开具中' },
      completed: { text: '已完成' },
      pending_info: { text: '已退回' },
    });

    const renewalStatuses = getInServiceStatusValueEnum(IN_SERVICE_ORDER_KINDS.CONTRACT_RENEWAL);
    expect(renewalStatuses).toHaveProperty('accepted');
    expect(renewalStatuses).toHaveProperty('failed');
  });

  it('maps batch renewal Excel rows to customer and department ids with row errors', () => {
    const customers = [{
      id: 'customer-1',
      customer_name: '测试客户',
      customer_code: 'C001',
      is_active: true,
      created_at: '',
    }];
    const departments = [{
      id: 'department-root',
      parent_id: null,
      code: 'BUSINESS',
      name: '业务团队',
      sort_order: 1,
      is_active: true,
      children: [{
        id: 'department-1',
        parent_id: 'department-root',
        code: 'D001',
        name: '业务一部',
        sort_order: 1,
        is_active: true,
      }],
    }];
    const rows = buildBatchRenewalRows([
      {
        客户名称: '测试客户',
        发起部门: '业务一部',
        姓名: '张三',
        证件号码: '330206199001011234',
        合同期限形式: '固定期限',
        合同开始日期: '2026-09-01',
        合同结束日期: '2027-08-31',
        基本工资: '8,000',
      },
      {
        客户名称: '不存在客户',
        发起部门: '业务一部',
        姓名: '李四',
        证件号码: '330206199001011235',
        合同期限形式: '无固定期限',
        合同开始日期: '2026-09-01',
        基本工资: 0,
      },
    ], customers, flattenDepartments(departments));

    expect(rows[0].error).toBeNull();
    expect(rows[0].payload).toMatchObject({
      customerId: 'customer-1',
      departmentId: 'department-1',
      extraData: {
        signing_method: '续签',
        contract_term_type: '固定期限',
        contract_start_date: '2026-09-01',
        contract_end_date: '2027-08-31',
        base_salary: 8000,
      },
    });
    expect(rows[1].error).toContain('客户不存在');
    expect(rows[1].error).toContain('基本工资必须大于0');
    expect(rows[1].payload).toBeNull();
  });
});

describe('single-business mock lifecycle', () => {
  beforeEach(() => localStorage.clear());

  it('creates without approval and preserves both supplement return paths', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(123456);
    const created = await createInServiceOrder({
      customerId: 'customer-1',
      departmentId: 'department-1',
      expectedCompletionDate: '2026-08-05',
      businessReason: '社保补缴',
      businessType: 'registration',
      processType: 'supplementary_payment',
      requirementType: 'unpaid_supplement',
      province: '江苏',
      city: '南京市',
      district: '建邺区',
      businessDescription: '办理社保补缴',
      serviceFee: 100,
      attachments: [],
    });
    nowSpy.mockRestore();

    expect(created.id).toBe('is-123456');
    expect(created.status).toBe('dispatched');

    await acceptInServiceOrder(created.id);
    await requestInServiceOrderInfo(created.id, '补充身份证');
    const initialResubmit = await resubmitInServiceOrder(created.id, { attachments: ['a1'] });
    expect(initialResubmit.status).toBe('accepted');

    await acceptInServiceOrder(created.id);
    await confirmInServiceOrder(created.id);
    await startInServiceProcessing(created.id, 'offline');
    await requestInServiceOrderInfo(created.id, '补充盖章材料');
    const processingResubmit = await resubmitInServiceOrder(created.id, { attachments: ['a2'] });
    expect(processingResubmit.status).toBe('processing');
    expect(processingResubmit.attachments).toEqual(['a1', 'a2']);

    const failed = await failInServiceOrder(created.id, '政策不允许办理');
    expect(failed.status).toBe('failed');
    await expect(getInServiceOrder(created.id)).resolves.toMatchObject({ status: 'failed' });
  });
});
