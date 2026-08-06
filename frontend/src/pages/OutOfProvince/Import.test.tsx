import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OutOfProvinceImport from './Import';

vi.mock('@/components/ExcelUploader', () => ({
  default: () => <div data-testid="excel-uploader">Excel 上传组件</div>,
}));

describe('OutOfProvinceImport', () => {
  beforeEach(() => {
    vi.spyOn(App, 'useApp').mockReturnValue({
      message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), loading: vi.fn(), open: vi.fn(), destroy: vi.fn() } as any,
      notification: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), open: vi.fn(), destroy: vi.fn() } as any,
      modal: { confirm: vi.fn() } as any,
    });
  });

  it('explains the fixed Cainiao sheet and system field mapping in Chinese', async () => {
    render(<MemoryRouter><OutOfProvinceImport /></MemoryRouter>);

    expect(screen.getByText('省外导入与北仑数据独立')).toBeInTheDocument();
    expect(screen.getByText('固定读取的 Excel 工作表')).toBeInTheDocument();
    expect(screen.getByText('参保申请单')).toBeInTheDocument();
    expect(screen.getByText('标签 → 客户/项目名称')).toBeInTheDocument();
    expect(screen.getByText(/不会再让 AI 猜字段/)).toBeInTheDocument();

    await userEvent.click(screen.getByText('省外减员'));

    expect(screen.getByText('停保申请单')).toBeInTheDocument();
    expect(screen.getByText('最后工作日 → 最后工作日')).toBeInTheDocument();
  });
});
