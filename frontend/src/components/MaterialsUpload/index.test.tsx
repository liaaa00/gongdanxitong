import React from 'react';
import { App } from 'antd';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MaterialsUpload from './index';

const mocks = vi.hoisted(() => ({
  listOrderAttachments: vi.fn(),
  uploadMaterialAttachment: vi.fn(),
}));

vi.mock('@/services/attachments', () => ({
  listOrderAttachments: (...args: unknown[]) => mocks.listOrderAttachments(...args),
  deleteOrderAttachment: vi.fn(),
  downloadOrderAttachment: vi.fn(),
  previewOrderAttachment: vi.fn(),
  receiveOrderAttachment: vi.fn(),
  reviewOrderAttachment: vi.fn(),
  uploadMaterialAttachment: (...args: unknown[]) => mocks.uploadMaterialAttachment(...args),
}));

vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');
  const react = await vi.importActual<typeof import('react')>('react');
  const stableMessage = {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  };
  const TestApp = Object.assign(
    ({ children }: { children?: React.ReactNode }) => react.createElement(react.Fragment, null, children),
    {
      useApp: () => ({ message: stableMessage }),
    },
  );
  return { ...actual, App: TestApp };
});

const renderHistory = () => render(
  <App>
    <MaterialsUpload
      workOrderId="work-order-1"
      dispatchedOrderId="dispatched-order-1"
      bizPurpose="resignation_cert"
      readOnly
      title="历史签署成品附件（可预览/下载）"
      emptyText="暂无历史签署成品"
    />
  </App>,
);

const renderEditable = () => render(
  <App>
    <MaterialsUpload
      workOrderId="work-order-1"
      dispatchedOrderId="dispatched-order-1"
      bizPurpose="resignation_cert"
      title="材料上传"
      emptyText="暂无材料"
    />
  </App>,
);

describe('MaterialsUpload', () => {
  beforeEach(() => {
    mocks.listOrderAttachments.mockReset();
    mocks.uploadMaterialAttachment.mockReset();
  });

  afterEach(() => cleanup());

  it('shows an explicit empty state for historical signed certificates', async () => {
    mocks.listOrderAttachments.mockResolvedValue([]);

    renderHistory();

    await waitFor(() => expect(screen.getByText('暂无历史签署成品')).toBeInTheDocument());
    expect(screen.getByText('历史签署成品附件（可预览/下载）')).toBeInTheDocument();
  });

  it('keeps the uploaded original Chinese file name', async () => {
    mocks.listOrderAttachments.mockResolvedValue([{
      id: 'attachment-1',
      work_order_id: 'work-order-1',
      dispatched_order_id: 'dispatched-order-1',
      biz_purpose: 'resignation_cert',
      file_name: 'stored-file.pdf',
      original_name: '离职证明材料.pdf',
      file_size: 1024,
      status: 'received',
      download_url: '/api/files/attachment-1',
    }]);

    renderHistory();

    await waitFor(() => expect(screen.getByText('离职证明材料.pdf')).toBeInTheDocument());
  });

  it('accepts zip archives as allowed upload format', async () => {
    const user = userEvent.setup();
    mocks.listOrderAttachments.mockResolvedValue([]);
    mocks.uploadMaterialAttachment.mockResolvedValue({
      id: 'attachment-zip',
      work_order_id: 'work-order-1',
      dispatched_order_id: 'dispatched-order-1',
      biz_purpose: 'resignation_cert',
      file_name: 'stored-file.zip',
      original_name: '材料打包.zip',
      file_size: 2048,
      status: 'received',
      download_url: '/api/files/attachment-zip',
    });

    renderEditable();

    await waitFor(() => expect(screen.getByText('暂无材料')).toBeInTheDocument());
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.accept).toContain('.zip');
    await user.upload(input, new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], '材料打包.zip', { type: 'application/zip' }));

    await waitFor(() => expect(screen.getByText('确认上传')).toBeInTheDocument());
    await user.click(screen.getByText('确认上传'));

    await waitFor(() => expect(mocks.uploadMaterialAttachment).toHaveBeenCalledTimes(1));
    const uploadedFile = mocks.uploadMaterialAttachment.mock.calls[0][0] as File;
    expect(uploadedFile.name).toBe('材料打包.zip');
    await waitFor(() => expect(screen.getAllByText('材料打包.zip').length).toBeGreaterThan(0));
  });

  it('rejects executable files outside the whitelist', async () => {
    const user = userEvent.setup();
    mocks.listOrderAttachments.mockResolvedValue([]);

    renderEditable();

    await waitFor(() => expect(screen.getByText('暂无材料')).toBeInTheDocument());
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['MZ'], 'virus.exe', { type: 'application/x-msdownload' }));

    await waitFor(() => expect(screen.queryByText('确认上传')).not.toBeInTheDocument());
    expect(mocks.uploadMaterialAttachment).not.toHaveBeenCalled();
  });
});
