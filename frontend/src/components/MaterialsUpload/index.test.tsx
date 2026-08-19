import React from 'react';
import { App } from 'antd';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MaterialsUpload from './index';

const mocks = vi.hoisted(() => ({
  listOrderAttachments: vi.fn(),
}));

vi.mock('@/services/attachments', () => ({
  listOrderAttachments: (...args: unknown[]) => mocks.listOrderAttachments(...args),
  deleteOrderAttachment: vi.fn(),
  downloadOrderAttachment: vi.fn(),
  previewOrderAttachment: vi.fn(),
  receiveOrderAttachment: vi.fn(),
  reviewOrderAttachment: vi.fn(),
  uploadMaterialAttachment: vi.fn(),
}));

vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');
  const react = await vi.importActual<typeof import('react')>('react');
  const TestApp = Object.assign(
    ({ children }: { children?: React.ReactNode }) => react.createElement(react.Fragment, null, children),
    {
      useApp: () => ({
        message: {
          success: vi.fn(),
          error: vi.fn(),
          warning: vi.fn(),
        },
      }),
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

describe('MaterialsUpload', () => {
  beforeEach(() => {
    mocks.listOrderAttachments.mockReset();
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
});
