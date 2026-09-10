import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as XLSX from 'xlsx';
import RuleBatchActions from './RuleBatchActions';

const mocks = vi.hoisted(() => ({
  getAllCustomerRules: vi.fn(), batchUpdateCustomerRules: vi.fn(), importCustomerRulesFromOrders: vi.fn(),
  writeFile: vi.fn(), onComplete: vi.fn(), message: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));
vi.mock('@/services/customerRules', () => ({
  getAllCustomerRules: mocks.getAllCustomerRules, batchUpdateCustomerRules: mocks.batchUpdateCustomerRules,
  importCustomerRulesFromOrders: mocks.importCustomerRulesFromOrders,
}));
vi.mock('xlsx', async () => ({ ...await vi.importActual<typeof import('xlsx')>('xlsx'), writeFile: mocks.writeFile }));
vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');
  const Upload = ({ beforeUpload, children }: { beforeUpload: (file: File) => Promise<unknown>; children: ReactNode }) =>
    <div>{children}<input aria-label="导入Excel" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void beforeUpload(file); }} /></div>;
  Upload.LIST_IGNORE = actual.Upload.LIST_IGNORE;
  return {
    ...actual, Upload,
    App: { ...actual.App, useApp: () => ({ message: mocks.message }) },
  };
});
const id1 = '11111111-1111-4111-8111-111111111111';
const id2 = '22222222-2222-4222-8222-222222222222';
const customer = {
  customerId: id1, customerCode: 'C001', customerName: '测试客户', configured: true,
  onboardingDefaults: {}, resignationDefaults: {}, salaryRules: { billingDay: 15, reminderEnabled: true, reminderWorkdayOffsets: [3, 2, 1] },
  sharedEmailRules: { mailbox: '', routeKey: '' }, completionEmailEnabled: false, completionEmailTo: [], completionEmailCc: [],
  completionEmailFields: ['order_no'], completionEmailBusinessTypes: ['onboarding', 'resignation', 'salary'], isActive: true,
};
function upload(rows: Record<string, unknown>[]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), '客户办理规则');
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  const file = new File([bytes], '规则.xlsx');
  Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes });
  fireEvent.change(screen.getByLabelText('导入Excel'), { target: { files: [file] } });
}

describe('办理规则批量操作', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAllCustomerRules.mockResolvedValue([customer]);
    mocks.onComplete.mockResolvedValue(undefined);
  });

  it('downloads the current filter across all customer pages and embeds the customer UUID', async () => {
    render(<RuleBatchActions keyword="测试" onComplete={mocks.onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /下载批量Excel模板/ }));
    await waitFor(() => expect(mocks.writeFile).toHaveBeenCalled());
    expect(mocks.getAllCustomerRules).toHaveBeenCalledWith('测试');
    const [workbook] = mocks.writeFile.mock.calls[0];
    expect(XLSX.utils.sheet_to_json(workbook.Sheets['客户办理规则'])).toEqual([
      expect.objectContaining({ 客户UUID: id1, 客户编码: 'C001', 客户名称: '测试客户' }),
    ]);
  });

  it('imports valid rows by UUID and shows local validation failures alongside backend success/failure', async () => {
    mocks.batchUpdateCustomerRules.mockResolvedValue({
      total: 2, successCount: 1, failedCount: 1,
      results: [{ customerId: id1, customerName: '真实客户一', customerCode: 'REAL001', success: true, message: '导入成功' }, { customerId: id2, success: false, message: '客户不存在' }],
    });
    render(<RuleBatchActions keyword="" onComplete={mocks.onComplete} />);
    upload([
      { 客户UUID: id1, 客户名称: '同名客户', '薪资·每月账单日': 10 },
      { 客户UUID: '错误编码', 客户名称: '同名客户', '薪资·每月账单日': 11 },
      { 客户UUID: id2, 客户名称: '同名客户', '薪资·每月账单日': 12 },
    ]);
    await waitFor(() => expect(mocks.batchUpdateCustomerRules).toHaveBeenCalledTimes(1));
    expect(mocks.batchUpdateCustomerRules).toHaveBeenCalledWith([
      { customerId: id1, rowNumber: 2, rule: { salaryRules: { billingDay: 10, reminderWorkdayOffsets: [3, 2, 1] } } },
      { customerId: id2, rowNumber: 4, rule: { salaryRules: { billingDay: 12, reminderWorkdayOffsets: [3, 2, 1] } } },
    ]);
    expect(await screen.findByText('共 3 行，成功 1 行，失败 2 行')).toBeInTheDocument();
    expect(screen.getByText('客户不存在')).toBeInTheDocument();
    expect(screen.getByText('真实客户一')).toBeInTheDocument();
    expect(screen.getByText(/客户UUID缺失或格式错误/)).toBeInTheDocument();
    expect(mocks.onComplete).toHaveBeenCalledTimes(1);
  });

  it('sends explicit filtered customer UUIDs for historical import and shows skipped/manual-priority outcomes', async () => {
    mocks.importCustomerRulesFromOrders.mockResolvedValue({
      customerCount: 1, importedCount: 0, skippedCount: 1, failedCount: 0,
      results: [{ customerId: id1, customerName: '测试客户', status: 'skipped', message: '已有人工配置，保持不变' }],
    });
    render(<RuleBatchActions keyword="测试" onComplete={mocks.onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /从历史工单带入/ }));
    expect(screen.getByText(/账单日、共享邮箱和办结邮件收件人需要通过页面或Excel配置/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /开始带入/ }));
    await waitFor(() => expect(mocks.importCustomerRulesFromOrders).toHaveBeenCalledWith([id1]));
    expect(await screen.findByText('共 1 家客户，带入 0 家，跳过 1 家，失败 0 家')).toBeInTheDocument();
    expect(screen.getByText('已有人工配置，保持不变')).toBeInTheDocument();
  });
});
