import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigProvider } from 'antd';
import SalaryReturnsPage from './index';

const mocks = vi.hoisted(() => ({
  getPortalSalaryReturns: vi.fn(), retryPortalEmail: vi.fn(), getAllCustomerRules: vi.fn(),
  message: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/services/customerPortalBusiness', () => ({
  getPortalSalaryReturns: mocks.getPortalSalaryReturns,
  retryPortalEmail: mocks.retryPortalEmail,
}));
vi.mock('@/services/customerRules', () => ({ getAllCustomerRules: mocks.getAllCustomerRules }));
vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');
  return { ...actual, App: { ...actual.App, useApp: () => ({ message: mocks.message }) } };
});

const attachment = (fileId: string, fileName: string) => ({ fileId, fileName, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 1024, downloadUrl: `/api/files/${fileId}` });

/** 客户在门户选“附件提交”：文字说明为空，附件必须可见。 */
const attachmentRow = {
  id: 'submission-1', customerId: 'customer-1', customerName: '测试客户', customerCode: 'C001', requestNo: 'SAL-001', month: '2026-09', status: 'completed',
  mode: 'changed', channel: 'attachment', note: '', createdAt: '2026-09-01T01:00:00.000Z', completedAt: '2026-09-02T01:00:00.000Z', resultNote: '已完成核对',
  attachments: [attachment('file-1', '薪资结果.xlsx')],
  submissionAttachments: [attachment('file-1', '薪资结果.xlsx')],
  completionAttachments: [attachment('file-2', '办结结果.xlsx')],
  attachmentEmail: { id: 'mail-1', status: 'sent', attemptCount: 1, lastError: null, sentAt: '2026-09-01T02:00:00.000Z', toRecipients: ['shared@example.test'] },
  completionEmail: { id: 'mail-2', status: 'failed', attemptCount: 2, lastError: 'SMTP 未配置', sentAt: null, toRecipients: ['customer@example.test'] },
};

/** 客户在门户选“文字说明”：没有附件也要把填写内容展示出来。 */
const textRow = {
  ...attachmentRow, id: 'submission-2', requestNo: 'SAL-002',
  channel: 'text', note: '本月新增 3 人绩效调整，明细见线下邮件',
  attachments: [], submissionAttachments: [], completionAttachments: [],
  attachmentEmail: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAllCustomerRules.mockResolvedValue([{ customerId: 'customer-1', customerCode: 'C001', customerName: '测试客户' }]);
  mocks.getPortalSalaryReturns.mockResolvedValue({ items: [attachmentRow, textRow], total: 2, page: 1, pageSize: 20 });
  mocks.retryPortalEmail.mockResolvedValue({ ...attachmentRow.completionEmail, status: 'pending' });
});
afterEach(cleanup);

function renderPage() {
  return render(<ConfigProvider theme={{ token: { motion: false } }}><SalaryReturnsPage /></ConfigProvider>);
}

describe('薪酬回传页面', () => {
  it('列表同时呈现文字填写与附件提交两类门户内容', async () => {
    renderPage();
    expect(await screen.findByText('SAL-001')).toBeInTheDocument();
    expect(screen.getAllByText('已办结').length).toBe(2);
    expect(screen.getAllByText('发送失败').length).toBe(2);
    expect(screen.getByText('附件提交')).toBeInTheDocument();
    expect(screen.getByText('薪资结果.xlsx')).toBeInTheDocument();
    expect(screen.getAllByText('本月新增 3 人绩效调整，明细见线下邮件').length).toBe(1);
    expect(screen.getAllByText('无附件').length).toBeGreaterThan(0);
  });

  it('详情按门户填写方式展示文字说明、客户附件、回传附件与邮件状态，失败邮件可重试', async () => {
    renderPage();
    await screen.findByText('SAL-001');
    fireEvent.click(screen.getAllByRole('button', { name: '查看详情' })[0]);
    expect(await screen.findByText('客户在门户填写的内容')).toBeInTheDocument();
    expect(screen.getByText('附件提交内容')).toBeInTheDocument();
    expect(screen.getByText('办结结果.xlsx')).toBeInTheDocument();
    expect(screen.getAllByText('SMTP 未配置').length).toBeGreaterThan(0);
    const retryButton = screen.getAllByRole('button').find((button) => /重\s*试/.test(button.textContent ?? ''));
    fireEvent.click(retryButton!);
    await waitFor(() => expect(mocks.retryPortalEmail).toHaveBeenCalledWith('customer-1', 'mail-2'));
  });

  it('纯文字提交的受理记录不显示附件占位缺失，直接呈现客户填写的文字', async () => {
    renderPage();
    await screen.findByText('SAL-002');
    fireEvent.click(screen.getAllByRole('button', { name: '查看详情' })[1]);
    expect(await screen.findByText('客户在门户填写的内容')).toBeInTheDocument();
    expect(screen.getAllByText('本月新增 3 人绩效调整，明细见线下邮件').length).toBe(2);
    expect(screen.getByText('客户未上传附件')).toBeInTheDocument();
    expect(screen.queryByText('附件记录缺失')).not.toBeInTheDocument();
  });
});
