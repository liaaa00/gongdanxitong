import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OutOfProvinceImport from './Import';

vi.mock('@/components/ExcelUploader', () => ({
  default: () => <div data-testid="excel-uploader">Excel 上传组件</div>,
}));

function renderImport() {
  return render(
    <MemoryRouter initialEntries={['/out-of-province/import']}>
      <Routes>
        <Route path="/out-of-province/import" element={<OutOfProvinceImport />} />
        <Route path="/out-of-province/increase" element={<div>省外增员列表页</div>} />
        <Route path="/out-of-province/decrease" element={<div>省外减员列表页</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OutOfProvinceImport', () => {
  beforeEach(() => {
    vi.spyOn(App, 'useApp').mockReturnValue({
      message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), loading: vi.fn(), open: vi.fn(), destroy: vi.fn() } as any,
      notification: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), open: vi.fn(), destroy: vi.fn() } as any,
      modal: { confirm: vi.fn() } as any,
    });
  });

  it('explains that province imports create independent direct orders', () => {
    renderImport();

    expect(screen.getByText('省外导入与北仑数据独立')).toBeInTheDocument();
    expect(screen.getByText(/Excel 每条记录会直接生成一张工单/)).toBeInTheDocument();
    expect(screen.getByText('返回省外增员列表')).toBeInTheDocument();
  });

  it('returns to the list matching the selected import type', async () => {
    const user = userEvent.setup();
    renderImport();

    await user.click(screen.getByText('省外减员'));
    await user.click(screen.getByText('返回省外减员列表'));

    expect(await screen.findByText('省外减员列表页')).toBeInTheDocument();
  });
});
