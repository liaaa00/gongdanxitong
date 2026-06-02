import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DispatchedBatchImportModal from './DispatchedBatchImportModal';
import { batchImportDispatchedOrders } from '@/services/dispatchedOrders';

vi.mock('xlsx', () => ({
  read: vi.fn(() => ({ SheetNames: ['Sheet1'], Sheets: { Sheet1: {} } })),
  utils: {
    sheet_to_json: vi.fn(() => [
      { 工单编号: 'WO-001', 员工证件号: '330102199001010011', 办理结果: '乱填动作', 退回原因: '资料缺失' },
    ]),
  },
}));

vi.mock('@/services/dispatchedOrders', () => ({
  batchImportDispatchedOrders: vi.fn().mockResolvedValue({
    success: true,
    totalRows: 1,
    successRows: 1,
    failRows: 0,
    rows: [{ rowNumber: 2, success: true, orderNo: 'WO-001', employeeIdCard: '330102199001010011', action: 'return', message: 'ok' }],
  }),
}));

vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');
  return {
    ...actual,
    App: {
      ...actual.App,
      useApp: () => ({ message: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() } }),
    },
  };
});

function makeFile() {
  return new File(['mock'], 'template.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

describe('DispatchedBatchImportModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses explicit batch action instead of free-text Excel action', async () => {
    render(
      <DispatchedBatchImportModal
        open
        mode="status"
        moduleOptions={[{ label: '劳动合同签订', value: 'contract' }]}
        defaultModuleCode="contract"
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('批办理退回'));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });

    await waitFor(() => expect(screen.getByText('WO-001')).toBeTruthy());
    fireEvent.click(screen.getByText('确认导入'));

    await waitFor(() => expect(batchImportDispatchedOrders).toHaveBeenCalledWith(expect.objectContaining({
      moduleCode: 'contract',
      mode: 'status',
      forceAction: 'return',
    })));
    const payload = vi.mocked(batchImportDispatchedOrders).mock.calls[0][0];
    expect(payload.rows[0]).toEqual(expect.objectContaining({ result: '退回', status: '退回' }));
  });

  it('shows only provided module options', () => {
    render(
      <DispatchedBatchImportModal
        open
        mode="status"
        moduleOptions={[{ label: '入职联系', value: 'onboarding_contact' }]}
        defaultModuleCode="onboarding_contact"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('入职联系')).toBeTruthy();
    expect(screen.queryByText('数据录入')).toBeNull();
  });

  it('keeps parsed rows when parent page refreshes module option references while modal stays open', async () => {
    const { rerender } = render(
      <DispatchedBatchImportModal
        open
        mode="status"
        moduleOptions={[{ label: '劳动合同签订', value: 'contract' }]}
        defaultModuleCode="contract"
        onClose={vi.fn()}
      />,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });
    await waitFor(() => expect(screen.getByText('WO-001')).toBeTruthy());

    rerender(
      <DispatchedBatchImportModal
        open
        mode="status"
        moduleOptions={[{ label: '劳动合同签订', value: 'contract' }]}
        defaultModuleCode="contract"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('WO-001')).toBeTruthy();
    expect(screen.getByText('确认导入')).not.toBeDisabled();
  });
});
