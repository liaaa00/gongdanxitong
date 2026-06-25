import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkOrdersImport from './index';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  search: '?orderType=onboarding',
  previewImport: vi.fn(),
  confirmImport: vi.fn(),
  getImportJob: vi.fn(),
  downloadImportErrorReport: vi.fn(),
  downloadServerImportTemplate: vi.fn(),
  downloadCurrentImportTemplate: vi.fn(),
  messageSuccess: vi.fn(),
  messageError: vi.fn(),
  messageWarning: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
    useLocation: () => ({ search: mocks.search }),
  };
});

vi.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children, header }: { children: React.ReactNode; header?: { title?: string } }) => (
    <section>
      {header?.title && <h1>{header.title}</h1>}
      {children}
    </section>
  ),
}));

vi.mock('antd', () => ({
  App: { useApp: () => ({ message: { success: mocks.messageSuccess, error: mocks.messageError, warning: mocks.messageWarning } }) },
  Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button>,
  Card: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Space: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@ant-design/icons', () => ({
  DownloadOutlined: () => null,
}));

vi.mock('@/components/ExcelUploader', () => ({
  default: () => <div data-testid="excel-uploader" />,
}));

vi.mock('@/services/workOrders', () => ({
  previewImport: (...args: unknown[]) => mocks.previewImport(...args),
  confirmImport: (...args: unknown[]) => mocks.confirmImport(...args),
  getImportJob: (...args: unknown[]) => mocks.getImportJob(...args),
  downloadImportErrorReport: (...args: unknown[]) => mocks.downloadImportErrorReport(...args),
  downloadServerImportTemplate: (...args: unknown[]) => mocks.downloadServerImportTemplate(...args),
  downloadCurrentImportTemplate: (...args: unknown[]) => mocks.downloadCurrentImportTemplate(...args),
}));

describe('WorkOrdersImport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.search = '?orderType=onboarding';
    mocks.downloadServerImportTemplate.mockResolvedValue({ fieldCount: 2, fileName: '工单管理系统-入职导入模板.xlsx' });
  });

  it('downloads the server import template configured in admin settings', async () => {
    render(<WorkOrdersImport />);

    fireEvent.click(screen.getByRole('button', { name: '下载当前字段模板' }));

    await waitFor(() => expect(mocks.downloadServerImportTemplate).toHaveBeenCalledWith('onboarding'));
    expect(mocks.downloadCurrentImportTemplate).not.toHaveBeenCalled();
    expect(mocks.messageSuccess).toHaveBeenCalled();
  });

  it('passes resignation order type to the server template download API', async () => {
    mocks.search = '?orderType=resignation';
    render(<WorkOrdersImport />);

    fireEvent.click(screen.getByRole('button', { name: '下载当前字段模板' }));

    await waitFor(() => expect(mocks.downloadServerImportTemplate).toHaveBeenCalledWith('resignation'));
  });
});
