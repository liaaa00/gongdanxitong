import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IN_SERVICE_ORDER_KINDS } from '@/constants/inService';
import InServiceOrderNew from './New';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  create: vi.fn(),
  modalSuccess: vi.fn(),
  messageError: vi.fn(),
  validateFields: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('@/services/inServiceOrders', () => ({
  createInServiceOrder: (...args: unknown[]) => mocks.create(...args),
}));

vi.mock('./components/InServiceOrderForm', () => ({
  default: () => <div>order form</div>,
  normalizeInServiceOrderFormValues: (value: unknown) => value,
}));

vi.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

vi.mock('antd', () => ({
  App: {
    useApp: () => ({
      message: { error: mocks.messageError },
      modal: { success: mocks.modalSuccess },
    }),
  },
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
  Form: {
    useForm: () => [{ validateFields: mocks.validateFields }],
  },
  Space: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('InServiceOrderNew success navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateFields.mockResolvedValue({ employeeName: '张三' });
    mocks.create.mockResolvedValue({
      id: 'order-1',
      orderNo: 'IS-1',
      handlerName: '办理人',
    });
  });

  it.each([
    [IN_SERVICE_ORDER_KINDS.CONTRACT_RENEWAL, undefined, '/renewal/order-1'],
    [IN_SERVICE_ORDER_KINDS.CERTIFICATE, undefined, '/in-service/certificates/order-1'],
    [IN_SERVICE_ORDER_KINDS.SINGLE_BUSINESS, undefined, '/in-service/order-1'],
    [IN_SERVICE_ORDER_KINDS.SINGLE_BUSINESS, 'out_of_province', '/out-of-province/single-business/order-1'],
  ] as const)('navigates %s creation to its real detail route', async (orderKind, businessScope, expected) => {
    render(<InServiceOrderNew orderKind={orderKind} businessScope={businessScope} />);

    fireEvent.click(screen.getByRole('button', { name: '提交工单' }));
    await waitFor(() => expect(mocks.modalSuccess).toHaveBeenCalled());

    const options = mocks.modalSuccess.mock.calls[0][0] as { onOk: () => void };
    options.onOk();
    expect(mocks.navigate).toHaveBeenCalledWith(expected);
  });
});
