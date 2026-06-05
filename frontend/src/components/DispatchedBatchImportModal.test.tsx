import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DispatchedBatchImportModal from './DispatchedBatchImportModal';
import { batchImportDispatchedOrders } from '@/services/dispatchedOrders';

const { xlsxMockState } = vi.hoisted(() => ({
  xlsxMockState: {
    workbook: { SheetNames: ['Sheet1'], Sheets: { Sheet1: { __rowsKey: 'Sheet1' } } as Record<string, { __rowsKey: string }> },
    rowsBySheet: {
      Sheet1: [{ 工单编号: 'WO-001', 员工证件号: '330102199001010011', 办理结果: '乱填动作', 退回原因: '资料缺失' }],
    } as Record<string, Array<Record<string, unknown>>>,
  },
}));

vi.mock('xlsx', () => ({
  read: vi.fn(() => xlsxMockState.workbook),
  utils: {
    sheet_to_json: vi.fn((sheet: { __rowsKey?: string }) => xlsxMockState.rowsBySheet[sheet.__rowsKey || 'Sheet1'] || []),
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
    xlsxMockState.workbook = { SheetNames: ['Sheet1'], Sheets: { Sheet1: { __rowsKey: 'Sheet1' } } };
    xlsxMockState.rowsBySheet = {
      Sheet1: [{ 工单编号: 'WO-001', 员工证件号: '330102199001010011', 办理结果: '乱填动作', 退回原因: '资料缺失' }],
    };
  });

  it('uses explicit batch action instead of free-text Excel action', async () => {
    render(
      <DispatchedBatchImportModal
        open
        mode="status"
        moduleOptions={[{ label: '劳动合同新签', value: 'contract' }]}
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

  it('hides complete remark input but keeps return reason input', () => {
    render(
      <DispatchedBatchImportModal
        open
        mode="status"
        moduleOptions={[{ label: '劳动合同新签', value: 'contract' }]}
        defaultModuleCode="contract"
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByPlaceholderText('完成时默认备注')).toBeNull();
    expect(screen.queryByPlaceholderText('请后道人员填写批量退回原因')).toBeNull();

    fireEvent.click(screen.getByText('批办理退回'));
    expect(screen.getByPlaceholderText('请后道人员填写批量退回原因')).toBeTruthy();
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

  it('hides module selector on fixed module pages', () => {
    render(
      <DispatchedBatchImportModal
        open
        mode="status"
        moduleOptions={[{ label: '入职联系', value: 'onboarding_contact' }]}
        defaultModuleCode="onboarding_contact"
        hideModuleSelect
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByText('子工单模块：')).toBeNull();
    expect(screen.queryByText('入职联系')).toBeNull();
  });

  it('prefers current module sheet and recognizes exported short identity headers', async () => {
    xlsxMockState.workbook = {
      SheetNames: ['劳动合同新签', '入职联系'],
      Sheets: {
        劳动合同新签: { __rowsKey: 'contract' },
        入职联系: { __rowsKey: 'onboarding_contact' },
      },
    };
    xlsxMockState.rowsBySheet = {
      contract: [{ 编号: 'WO-CONTRACT', 证件号: '111111111111111111' }],
      onboarding_contact: [{ 编号: 'WO-CONTACT', 证件号: '330102199001010011' }],
    };

    render(
      <DispatchedBatchImportModal
        open
        mode="status"
        moduleOptions={[{ label: '入职联系', value: 'onboarding_contact' }]}
        defaultModuleCode="onboarding_contact"
        hideModuleSelect
        onClose={vi.fn()}
      />,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });

    await waitFor(() => expect(screen.getByText('WO-CONTACT')).toBeTruthy());
    expect(screen.queryByText('WO-CONTRACT')).toBeNull();
    fireEvent.click(screen.getByText('确认导入'));

    await waitFor(() => expect(batchImportDispatchedOrders).toHaveBeenCalled());
    const payload = vi.mocked(batchImportDispatchedOrders).mock.calls[0][0];
    expect(payload.rows[0]).toEqual(expect.objectContaining({ orderNo: 'WO-CONTACT', employeeIdCard: '330102199001010011' }));
  });

  it('highlights voided rows blocked by batch import result', async () => {
    vi.mocked(batchImportDispatchedOrders).mockResolvedValueOnce({
      success: true,
      totalRows: 1,
      successRows: 0,
      failRows: 1,
      rows: [{ rowNumber: 2, success: false, orderNo: 'WO-VOID', employeeIdCard: '330102199001010011', action: 'complete', message: '该子工单已作废，不能批量导入办理完成' }],
    });
    xlsxMockState.rowsBySheet = {
      Sheet1: [{ 工单编号: 'WO-VOID', 员工证件号: '330102199001010011' }],
    };

    render(
      <DispatchedBatchImportModal
        open
        mode="status"
        moduleOptions={[{ label: '劳动合同新签', value: 'contract' }]}
        defaultModuleCode="contract"
        onClose={vi.fn()}
      />,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });
    await waitFor(() => expect(screen.getByText('WO-VOID')).toBeTruthy());
    fireEvent.click(screen.getByText('确认导入'));

    await waitFor(() => expect(screen.getByText('该子工单已作废，不能批量导入办理完成')).toBeTruthy());
    expect(screen.queryByText('已作废工单属于终止状态，系统已自动拦截，不会被批量导入完成、退回或修改。请查看下方失败明细。')).toBeNull();
  });

  it('keeps parsed rows when parent page refreshes module option references while modal stays open', async () => {
    const { rerender } = render(
      <DispatchedBatchImportModal
        open
        mode="status"
        moduleOptions={[{ label: '劳动合同新签', value: 'contract' }]}
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
        moduleOptions={[{ label: '劳动合同新签', value: 'contract' }]}
        defaultModuleCode="contract"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('WO-001')).toBeTruthy();
    expect(screen.getByText('确认导入')).not.toBeDisabled();
  });
});
