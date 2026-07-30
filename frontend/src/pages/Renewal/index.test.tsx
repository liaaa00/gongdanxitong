import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RenewalList from './index';

const { getInServiceOrdersMock, mockNavigate } = vi.hoisted(() => ({
  getInServiceOrdersMock: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/stores/userStore', () => ({
  useUserStore: (selector: (state: { user: unknown }) => unknown) => selector({
    user: {
      id: 'business-1',
      roles: [{ id: 'role-1', code: 'business_group_member', name: '业务员', level: '执行层' }],
    },
  }),
}));

vi.mock('@/services/inServiceOrders', () => ({
  getInServiceOrders: getInServiceOrdersMock,
}));

const renewalOrder = {
  id: 'renewal-1',
  orderNo: 'RN20260730001',
  orderKind: 'contract_renewal',
  businessScope: 'beilun',
  employeeName: '测试员工',
  idCardNo: '330206199001011234',
  customerId: 'customer-1',
  customerName: '测试客户',
  customerCode: 'C001',
  province: '浙江',
  city: '宁波市',
  district: '北仑区',
  status: 'dispatched',
  handleChannel: null,
  handlerId: 'handler-1',
  handlerName: '杨纯',
  createdBy: 'business-1',
  createdByName: '测试业务员',
  createdAt: '2026-07-30T00:00:00.000Z',
};

function renderPage() {
  return render(
    <MemoryRouter>
      <RenewalList />
    </MemoryRouter>,
  );
}

describe('Renewal List Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInServiceOrdersMock.mockResolvedValue({
      items: [renewalOrder],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it('renders the independent renewal page title and create action', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTitle('劳动合同续签')).toBeTruthy();
      expect(screen.getByText('发起劳动合同续签')).toBeTruthy();
    });
  });

  it('loads contract-renewal direct orders instead of legacy main orders', async () => {
    renderPage();

    expect(await screen.findByText('RN20260730001')).toBeTruthy();
    expect(getInServiceOrdersMock).toHaveBeenCalledWith(expect.objectContaining({
      orderKind: 'contract_renewal',
    }));
  });

  it('renders the renewal table container', async () => {
    const { container } = renderPage();

    await waitFor(() => {
      expect(container.textContent).toContain('劳动合同续签工单');
      expect(container.textContent).toContain('测试员工');
    });
  });

  it('navigates to the direct-order detail page', async () => {
    renderPage();

    fireEvent.click(await screen.findByText('详情'));
    expect(mockNavigate).toHaveBeenCalledWith('/in-service/renewal-1');
  });
});
