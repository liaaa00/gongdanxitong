import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OutOfProvinceImport from './Import';

vi.mock('@/components/ExcelUploader', () => ({
  default: () => <div data-testid="excel-uploader">Excel 上传组件</div>,
}));

function renderImport(initialEntry = '/out-of-province/import') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/out-of-province/import" element={<OutOfProvinceImport />} />
        <Route path="/out-of-province/increase" element={<div>菜鸟增员列表页</div>} />
        <Route path="/out-of-province/decrease" element={<div>菜鸟减员列表页</div>} />
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

  it('keeps the import controls without exposing internal dispatch explanations', () => {
    renderImport();

    expect(screen.queryByText('省外导入与北仑数据独立')).not.toBeInTheDocument();
    expect(screen.queryByText(/Excel 每条记录会直接生成一张工单/)).not.toBeInTheDocument();
    expect(screen.getByTestId('excel-uploader')).toBeInTheDocument();
    expect(screen.getByText('返回菜鸟增员列表')).toBeInTheDocument();
  });

  it('uses the list-provided decrease type when opening the import page', () => {
    renderImport('/out-of-province/import?orderType=out_of_province_decrease');

    expect(screen.getByText('返回菜鸟减员列表')).toBeInTheDocument();
  });

  it('returns to the list matching the selected import type', async () => {
    const user = userEvent.setup();
    renderImport();

    await user.click(screen.getByText('菜鸟减员'));
    await user.click(screen.getByText('返回菜鸟减员列表'));

    expect(await screen.findByText('菜鸟减员列表页')).toBeInTheDocument();
  });
});
