import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import type { CustomerRuleItem } from '@/services/customerRules';
import { createRulesWorkbook, parseRulesWorkbook } from './ruleExcel';

const id1 = '11111111-1111-4111-8111-111111111111';
const id2 = '22222222-2222-4222-8222-222222222222';
const customer: CustomerRuleItem = {
  customerId: id1, customerCode: 'DUPLICATE', customerName: '同名客户', configured: true,
  onboardingDefaults: { need_esign: false, fund_ratio: '5%+5%' }, resignationDefaults: {},
  salaryRules: { billingDay: 15, reminderEnabled: true, reminderWorkdayOffsets: [3, 2, 1] },
  sharedEmailRules: { mailbox: 'shared@example.com', routeKey: 'route-1' }, completionEmailEnabled: true,
  completionEmailTo: ['one@example.com'], completionEmailCc: ['cc@example.com'], completionEmailReplyTo: null,
  completionEmailBusinessTypes: ['onboarding', 'resignation', 'salary'], completionEmailFields: ['order_no'],
  objectionDeadlineDays: 3, isActive: true, updatedBy: null, updatedAt: null,
};
function workbook(rows: Record<string, unknown>[]) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), '客户办理规则');
  return book;
}

describe('客户办理规则Excel', () => {
  it('exports all customer UUIDs even when their names and codes match, and round-trips fixed business rules', () => {
    const book = createRulesWorkbook([customer, { ...customer, customerId: id2 }]);
    const roundTrip = XLSX.read(XLSX.write(book, { type: 'array', bookType: 'xlsx' }), { type: 'array' });
    const rows = parseRulesWorkbook(roundTrip);
    expect(rows.map((row) => row.customerId)).toEqual([id1, id2]);
    expect(rows[0]).toMatchObject({ rowNumber: 2, customerCode: 'DUPLICATE', customerName: '同名客户' });
    expect(rows[0].rule).toMatchObject({
      onboardingDefaults: { need_esign: false, fund_ratio: '5%+5%' },
      salaryRules: { billingDay: 15, reminderWorkdayOffsets: [3, 2, 1] },
      completionEmailBusinessTypes: ['onboarding', 'resignation', 'salary'],
      completionEmailTo: ['one@example.com'], completionEmailCc: ['cc@example.com'],
    });
    expect(rows.every((row) => !row.error)).toBe(true);
  });

  it('never matches a customer by name or code when UUID is missing', () => {
    const [row] = parseRulesWorkbook(workbook([{ 客户UUID: '', 客户编码: id1, 客户名称: customer.customerName, '薪资·每月账单日': 15 }]));
    expect(row.error).toMatch(/UUID缺失或格式错误/);
    expect(() => parseRulesWorkbook(workbook([{ 客户编码: id1, '薪资·每月账单日': 15 }]))).toThrow(/缺少客户UUID/);
  });

  it('preserves empty cells as omitted patches without disabling emails or clearing nested configuration', () => {
    const [row] = parseRulesWorkbook(workbook([{
      客户UUID: id1, '入职·需要电子签': '否', '入职·合同主体': '', '薪资·每月账单日': '',
      '薪资·启用提醒': '否', '共享邮箱·地址': '', '共享邮箱·路由标识': 'new-route',
      '办结邮件·启用': '', '办结邮件·收件人': 'one@example.com；two@example.com', '办结邮件·抄送': '',
    }]));
    expect(row.error).toBeUndefined();
    expect(row.rule.onboardingDefaults).toEqual({ need_esign: false });
    expect(row.rule.salaryRules).toEqual({ reminderEnabled: false, reminderWorkdayOffsets: [3, 2, 1] });
    expect(row.rule.sharedEmailRules).toEqual({ routeKey: 'new-route' });
    expect(row.rule).not.toHaveProperty('completionEmailEnabled');
    expect(row.rule).not.toHaveProperty('completionEmailCc');
    expect(row.rule.completionEmailTo).toEqual(['one@example.com', 'two@example.com']);
  });

  it('reports all repeated UUID rows but keeps unrelated rows valid', () => {
    const rows = parseRulesWorkbook(workbook([
      { 客户UUID: id1, '薪资·每月账单日': 10 },
      { 客户UUID: id1.toUpperCase(), '薪资·每月账单日': 12 },
      { 客户UUID: id2, '薪资·每月账单日': 15 },
    ]));
    expect(rows[0].error).toMatch(/UUID重复/);
    expect(rows[1].error).toMatch(/UUID重复/);
    expect(rows[2].error).toBeUndefined();
  });

  it('rejects invalid booleans and billing days row by row instead of silently treating them as blank', () => {
    const rows = parseRulesWorkbook(workbook([
      { 客户UUID: id1, '入职·需要电子签': '随便' },
      { 客户UUID: id2, '薪资·每月账单日': 29 },
    ]));
    expect(rows[0].error).toMatch(/入职·需要电子签/);
    expect(rows[1].error).toMatch(/1至28/);
  });

  it('retains physical Excel row numbers across blank rows and rejects formulas', () => {
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([['客户UUID', '薪资·每月账单日'], [id1, 12], [], [id2, 15]]);
    sheet.B4.f = '10+5';
    XLSX.utils.book_append_sheet(book, sheet, '客户办理规则');
    const rows = parseRulesWorkbook(book);
    expect(rows.map((row) => row.rowNumber)).toEqual([2, 4]);
    expect(rows[1].error).toMatch(/不支持公式/);
  });

  it('rejects unrecognized headers so a misspelled configuration column cannot silently disappear', () => {
    expect(() => parseRulesWorkbook(workbook([{ 客户UUID: id1, '薪资·可变提醒': '7' }]))).toThrow(/无法识别模板列/);
  });
});
