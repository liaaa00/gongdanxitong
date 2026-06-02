import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './index';
import { useUserStore } from '@/stores/userStore';
import { ROLE } from '@/constants/roles';
import { getDashboardCards, getLeaderTrend, getOrderTypeMatrix } from '@/services/dashboard';

type MatrixTestRow = {
  rowKey?: string;
  label?: string;
  completionRate?: number;
  children?: MatrixTestRow[];
};

vi.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ProTable: ({ dataSource = [] }: { dataSource?: MatrixTestRow[] }) => (
    <div data-testid="dashboard-matrix">
      {dataSource.flatMap((row) => [row, ...(row.children || [])]).map((row) => (
        <div key={row.rowKey || row.label}>{row.label}:{row.completionRate}</div>
      ))}
    </div>
  ),
}));

vi.mock('@/services/dashboard', () => ({
  getDashboardCards: vi.fn(),
  getOrderTypeMatrix: vi.fn(),
  getLeaderTrend: vi.fn(),
}));

vi.mock('@/services/moduleConfigs', () => ({
  getModuleConfigs: vi.fn().mockResolvedValue([]),
}));

const mockedGetDashboardCards = vi.mocked(getDashboardCards);
const mockedGetOrderTypeMatrix = vi.mocked(getOrderTypeMatrix);
const mockedGetLeaderTrend = vi.mocked(getLeaderTrend);

describe('Dashboard display behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUserStore.setState({
      user: {
        id: 'admin-1',
        username: 'admin',
        real_name: '管理员',
        email: '',
        phone: '',
        avatar_url: null,
        is_active: true,
        permissions: [],
        roles: [{ id: 'r-admin', code: ROLE.ADMIN, name: '管理员', level: 'global' }],
      },
      isLoggedIn: true,
      token: 'token',
      refreshToken: null,
    });
    mockedGetDashboardCards.mockResolvedValue({ totalPending: 0, monthPending: 0, totalThisMonth: 0, processing: 0, completed: 0, voided: 0, myMessages: 0 });
    mockedGetOrderTypeMatrix.mockRejectedValue(new Error('matrix unavailable'));
    mockedGetLeaderTrend.mockResolvedValue({
      orderType: 'onboarding',
      fallbackReason: 'endpoint_error',
      buckets: [],
    });
  });

  it('does not render removed downgrade warning copy while keeping fixed dashboard calls', async () => {
    const { container } = render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockedGetDashboardCards).toHaveBeenCalledWith('business', undefined, expect.stringMatching(/^\d{4}-\d{2}$/));
      expect(mockedGetOrderTypeMatrix).toHaveBeenCalledWith({ dimension: 'node', audience: 'business', scope: undefined, month: expect.stringMatching(/^\d{4}-\d{2}$/) });
      expect(mockedGetLeaderTrend).toHaveBeenCalledWith(expect.any(String), undefined, undefined, expect.any(AbortSignal), expect.stringMatching(/^\d{4}-\d{2}$/));
    });

    expect(container.textContent).not.toContain('工单总表暂时不可用，已展示 0 值或空态，请稍后刷新重试。');
    expect(container.textContent).not.toContain('负责人月办结完成率趋势暂时不可用，已展示空态数据，请稍后刷新重试。');
  });

  it('renders total pending separately from selected-month pending with visible metric explanation', async () => {
    mockedGetDashboardCards.mockResolvedValue({ totalPending: 12, monthPending: 3, totalThisMonth: 9, processing: 3, completed: 4, voided: 2, myMessages: 0 });

    const { container, getByText } = render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockedGetDashboardCards).toHaveBeenCalledWith('business', undefined, expect.stringMatching(/^\d{4}-\d{2}$/));
      expect(getByText('总待处理')).toBeTruthy();
      expect(getByText('单月待处理')).toBeTruthy();
      expect(container.textContent).toContain('总待处理=当前可见范围内全部未办结子工单');
    });

    expect(container.textContent).toContain('12');
    expect(container.textContent).toContain('3');
  });

  it('keeps business group leader scope switch available and defaults to mine', async () => {
    useUserStore.setState({
      user: {
        id: 'leader-1',
        username: 'leader',
        real_name: '业务组长',
        email: '',
        phone: '',
        avatar_url: null,
        is_active: true,
        permissions: [],
        roles: [{ id: 'r-leader', code: ROLE.BUSINESS_GROUP_LEADER, name: '业务组长', level: 'supervisor' }],
      },
    });

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockedGetDashboardCards).toHaveBeenCalledWith('business', 'mine', expect.stringMatching(/^\d{4}-\d{2}$/));
      expect(mockedGetOrderTypeMatrix).toHaveBeenCalledWith({ dimension: 'node', audience: 'business', scope: 'mine', month: expect.stringMatching(/^\d{4}-\d{2}$/) });
    });
  });

  it('keeps backend/service matrix completion rate so voided orders are excluded from displayed denominator', async () => {
    mockedGetDashboardCards.mockResolvedValue({ totalPending: 0, monthPending: 0, totalThisMonth: 100, processing: 0, completed: 98, voided: 2, myMessages: 0 });
    mockedGetOrderTypeMatrix.mockResolvedValue({
      rows: [
        {
          orderType: 'onboarding',
          moduleCode: 'onboarding_contact',
          label: '入职联系',
          total: 100,
          processing: 0,
          completed: 98,
          voided: 2,
          completionRate: 100,
        },
        {
          orderType: 'onboarding',
          moduleCode: 'contract',
          label: '劳动合同签订',
          total: 100,
          processing: 1,
          completed: 97,
          voided: 2,
          completionRate: 99,
        },
      ],
      total: 2,
    });

    const { getByText } = render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(getByText('入职联系:100')).toBeTruthy();
      expect(getByText('劳动合同签订:99')).toBeTruthy();
    });
  });
});
