import { InServiceOrder, InServiceOrderKind } from 'src/entities';
import {
  OUT_OF_PROVINCE_DECREASE_EXPORT_HEADERS,
  OUT_OF_PROVINCE_INCREASE_EXPORT_HEADERS,
  buildOutOfProvinceExport,
  buildOutOfProvinceExportRows,
} from 'src/modules/in-service-orders/out-of-province-export';
import {
  normalizeOutOfProvinceRow,
  suggestOutOfProvinceMapping,
} from 'src/modules/imports/out-of-province-import-mapping';
import { OrderType } from 'src/entities';

function makeOrder(orderKind: InServiceOrderKind): InServiceOrder {
  return Object.assign(new InServiceOrder(), {
    orderNo: 'OP-20260809-001',
    orderKind,
    employeeName: '张三',
    idCardNo: '330206199001011234',
    province: '广东',
    city: '深圳',
    createdBy: 'user-1',
    extraData: {
      insured_unit: '旧参保单位',
      contract_subject: '测试参保单位',
      social_pay_region: '深圳',
      start_month: '2026-08',
      fund_start_month: '2026-08',
      social_base: 12000,
      fund_base: 12000,
      fund_ratio: '单位12%+个人12%',
      social_insurance_result: '是',
      medical_insurance_result: '是',
      housing_fund_result: '否',
      social_insurance_remark: '已反馈',
      remark: '普通备注',
      special_remark: '特殊备注',
      last_work_date: '2026-08-08',
      social_stop_month: '2026-08',
      fund_stop_month: '2026-08',
      resignation_reason: '个人发展',
    },
    customer: { customerName: '测试客户' } as never,
    creator: { realName: '发起人A' } as never,
  });
}

describe('省外增减员导出', () => {
  it('renders the workbook increase columns and values in exact order', () => {
    const result = buildOutOfProvinceExport(makeOrder(InServiceOrderKind.OUT_OF_PROVINCE_INCREASE));
    expect(result.headers).toEqual(OUT_OF_PROVINCE_INCREASE_EXPORT_HEADERS);
    expect(result.values).toHaveLength(35);
    expect(result.values).toEqual(expect.arrayContaining(['测试参保单位', '广东 / 深圳', '单位12%+个人12%']));
  });

  it('renders the workbook decrease columns and values in exact order', () => {
    const result = buildOutOfProvinceExport(makeOrder(InServiceOrderKind.OUT_OF_PROVINCE_DECREASE));
    expect(result.headers).toEqual(OUT_OF_PROVINCE_DECREASE_EXPORT_HEADERS);
    expect(result.values).toHaveLength(15);
    expect(result.values.slice(0, 9)).toEqual([
      '张三', '330206199001011234', '测试参保单位', '深圳', '测试客户',
      '2026-08', '2026-08', '个人发展', '2026-08-08',
    ]);
  });

  it('uses contract_subject as the insured unit without falling back to social_location', () => {
    const order = makeOrder(InServiceOrderKind.OUT_OF_PROVINCE_INCREASE);
    order.extraData = {
      ...order.extraData,
      contract_subject: '劳动合同主体值',
      insured_unit: undefined,
      social_location: '缴纳地值',
    };
    expect(buildOutOfProvinceExport(order).values[2]).toBe('劳动合同主体值');
    order.extraData.contract_subject = undefined;
    expect(buildOutOfProvinceExport(order).values[2]).toBe('');
  });

  it('maps and normalizes the 参保机构名称 header', () => {
    const suggestion = suggestOutOfProvinceMapping(OrderType.OUT_OF_PROVINCE_INCREASE, ['参保机构名称']);
    expect(suggestion.suggestion['参保机构名称']).toBe('insured_unit');
    expect(normalizeOutOfProvinceRow({ contract_subject: '劳动合同主体值', social_location: '缴纳地值' }).insured_unit).toBe('劳动合同主体值');
  });

  it('builds multiple rows with one fixed sheet and rejects mixed order kinds', () => {
    const rows = buildOutOfProvinceExportRows([
      makeOrder(InServiceOrderKind.OUT_OF_PROVINCE_INCREASE),
      makeOrder(InServiceOrderKind.OUT_OF_PROVINCE_INCREASE),
    ]);
    expect(rows.headers).toEqual(OUT_OF_PROVINCE_INCREASE_EXPORT_HEADERS);
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0]).toHaveLength(35);
    expect(rows.rows[1]).toHaveLength(35);
    expect(() => buildOutOfProvinceExportRows([
      makeOrder(InServiceOrderKind.OUT_OF_PROVINCE_INCREASE),
      makeOrder(InServiceOrderKind.OUT_OF_PROVINCE_DECREASE),
    ])).toThrow('不能合并导出');
  });
});
