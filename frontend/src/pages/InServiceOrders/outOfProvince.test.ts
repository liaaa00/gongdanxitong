import { describe, expect, it } from 'vitest';
import { IN_SERVICE_ORDER_KINDS } from '@/constants/inService';
import type { InServiceOrder } from '@/services/inServiceOrders';
import {
  OUT_OF_PROVINCE_DECREASE_EXPORT_HEADERS,
  OUT_OF_PROVINCE_DECREASE_LIST_HEADERS,
  OUT_OF_PROVINCE_INCREASE_EXPORT_HEADERS,
  OUT_OF_PROVINCE_INCREASE_LIST_HEADERS,
  displayOutOfProvinceExtra,
  sortOutOfProvinceOrders,
} from './outOfProvince';
import { normalizeOutOfProvinceExtraData } from './components/InServiceOrderForm';

function order(overrides: Partial<InServiceOrder> = {}): InServiceOrder {
  return {
    id: 'order-1',
    orderNo: 'OP-1',
    orderType: 'in_service',
    orderKind: IN_SERVICE_ORDER_KINDS.OUT_OF_PROVINCE_INCREASE,
    businessScope: 'out_of_province',
    employeeName: '张三',
    idCardNo: '330206199001011234',
    extraData: { insured_unit: '测试单位', social_pay_region: '广东/深圳' },
    customerId: 'customer-1',
    departmentId: 'department-1',
    status: 'dispatched',
    handleChannel: 'online',
    handlerId: null,
    createdBy: 'user-1',
    pendingReturnStatus: null,
    transferHistory: [],
    approvedBy: null,
    rejectedBy: null,
    closedBy: null,
    rejectionReason: null,
    pendingInfoReason: null,
    completionRemark: null,
    closeReason: null,
    approvedAt: null,
    rejectedAt: null,
    dispatchedAt: null,
    acceptedAt: null,
    confirmedAt: null,
    processingAt: null,
    pendingInfoAt: null,
    completedAt: null,
    closedAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    version: 1,
    ...overrides,
  };
}

describe('省外增减员表格口径', () => {
  it('keeps the exact list and export column order from the workbook', () => {
    expect(OUT_OF_PROVINCE_INCREASE_LIST_HEADERS).toEqual([
      '查看', '状态', '参保单位', '员工姓名', '证件号', '缴纳地', '社保起缴月', '公积金起缴月',
      '社保是否办结', '医保是否办结', '公积金是否办结', '社保公积金办理备注', '派发时间', '完成时间',
    ]);
    expect(OUT_OF_PROVINCE_DECREASE_LIST_HEADERS).toEqual([
      '查看', '状态', '参保单位', '员工姓名', '证件号', '缴纳地', '社保停缴月', '公积金停缴月',
      '社保是否办结', '医保是否办结', '公积金是否办结', '社保公积金办理备注', '派发时间', '完成时间',
    ]);
    expect(OUT_OF_PROVINCE_INCREASE_EXPORT_HEADERS).toHaveLength(35);
    expect(OUT_OF_PROVINCE_DECREASE_EXPORT_HEADERS).toHaveLength(15);
  });

  it('normalizes historical camel-case fields without changing fund matching', () => {
    const normalized = normalizeOutOfProvinceExtraData({
      insuredUnit: '历史单位',
      paymentInstitution: '历史机构',
      contractStartDate: '2026-08-01',
      socialInsuranceResult: '是',
    });
    expect(normalized).toMatchObject({
      insured_unit: '历史单位',
      payment_institution: '历史机构',
      contract_start_date: '2026-08-01',
      social_insurance_result: '是',
    });
    expect(normalized).not.toHaveProperty('fund_ratio_options');
  });

  it('displays the confirmed social-location field as the insured unit', () => {
    expect(displayOutOfProvinceExtra(order({
      extraData: {
        socialLocation: '参保机构名称值',
        insured_unit: '历史参保单位',
      },
    }), 'insured_unit')).toBe('参保机构名称值');
  });

  it('sorts material-change approvals first and keeps the source order within each group', () => {
    const items = [
      order({ id: 'completed', status: 'completed' }),
      order({ id: 'approval-1', status: 'processing', extraData: { __materialChangeRequest: { changes: {} } } }),
      order({ id: 'approval-2', status: 'processing', extraData: { __materialChangeRequest: { changes: {} } } }),
      order({ id: 'pending-info', status: 'pending_info' }),
    ];
    expect(sortOutOfProvinceOrders(items).map((item) => item.id)).toEqual([
      'approval-1', 'approval-2', 'completed', 'pending-info',
    ]);
    expect(displayOutOfProvinceExtra(order(), 'insured_unit')).toBe('测试单位');
  });
});
