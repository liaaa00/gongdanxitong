import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './index';
import { useUserStore } from '@/stores/userStore';
import { ROLE } from '@/constants/roles';
import { getDashboardCards, getLeaderTrend, getOrderTypeMatrix } from '@/services/dashboard';
import { getModuleConfigs } from '@/services/moduleConfigs';
import { clearCachedListPageState, updateCachedListPageState } from '@/utils/listPageState';

type MatrixTestRow = {
  rowKey?: string;
  label?: string;
  total?: number;
  processing?: number;
  completed?: number;
  voided?: number;
  withdrawn?: number;
  completionRate?: number;
  children?: MatrixTestRow[];
};

vi.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children, header }: { children: React.ReactNode; header?: { title?: React.ReactNode } }) => <div>{header?.title}{children}</div>,
  ProTable: ({ dataSource = [] }: { dataSource?: MatrixTestRow[] }) => (
    <div data-testid="dashboard-matrix">
      {dataSource.flatMap((row) => [row, ...(row.children || [])]).map((row) => (
        <div key={row.rowKey || row.label}>{row.label}:{row.completionRate}:total={row.total}:processing={row.processing}:completed={row.completed}:voided={row.voided}:withdrawn={row.withdrawn}</div>
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
const mockedGetModuleConfigs = vi.mocked(getModuleConfigs);

describe('Dashboard display behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCachedListPageState('dashboard');
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
    mockedGetModuleConfigs.mockResolvedValue([]);
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

  it('renders Tao Mingyue biz_member as business dashboard with personal metrics', async () => {
    useUserStore.setState({
      user: {
        id: 'taomingyue-1',
        username: 'taomingyue',
        real_name: '陶明月',
        email: '',
        phone: '',
        avatar_url: null,
        is_active: true,
        permissions: [],
        roles: [{ id: 'r-biz-member', code: 'biz_member', name: '业务员', level: 'execution' }],
      },
    });
    mockedGetDashboardCards.mockResolvedValue({ totalPending: 0, monthPending: 0, totalThisMonth: 1, processing: 0, completed: 1, voided: 0, myMessages: 0 });

    const { container, getByText } = render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockedGetDashboardCards).toHaveBeenCalledWith('business', 'mine', expect.stringMatching(/^\d{4}-\d{2}$/));
      expect(mockedGetOrderTypeMatrix).toHaveBeenCalledWith({ dimension: 'node', audience: 'business', scope: 'mine', month: expect.stringMatching(/^\d{4}-\d{2}$/) });
      expect(getByText('业务员看板')).toBeTruthy();
      expect(getByText('本人本月工单')).toBeTruthy();
    });

    expect(container.textContent).not.toContain('后道办理看板');
    expect(container.textContent).toContain('1');
  });

  it('remembers a previously selected month from cache instead of defaulting to current month', async () => {
    updateCachedListPageState('dashboard', { month: '2026-01' });

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockedGetDashboardCards).toHaveBeenCalledWith('business', undefined, '2026-01');
      expect(mockedGetOrderTypeMatrix).toHaveBeenCalledWith({ dimension: 'node', audience: 'business', scope: undefined, month: '2026-01' });
    });
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
      expect(getByText('本月全量工单')).toBeTruthy();
      expect(getByText('本月已完成')).toBeTruthy();
      expect(getByText('本月已作废')).toBeTruthy();
      expect(container.textContent).not.toContain('总待处理=当前可见范围内全部未办结子工单');
    });

    expect(container.textContent).toContain('12');
    expect(container.textContent).toContain('3');
  });

  it('wraps metric cards responsively instead of compressing six fixed columns', () => {
    const { getByTestId } = render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(getByTestId('dashboard-metric-cards').style.gridTemplateColumns)
      .toBe('repeat(auto-fit, minmax(150px, 1fr))');
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
          label: '劳动合同新签',
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
      expect(getByText(/入职联系:100:/)).toBeTruthy();
      expect(getByText(/劳动合同新签:99:/)).toBeTruthy();
    });
  });

  it('counts withdrawn statuses as unfinished while still showing withdrawn separately', async () => {
    mockedGetDashboardCards.mockResolvedValue({ totalPending: 146, monthPending: 146, totalThisMonth: 179, processing: 146, completed: 28, voided: 5, myMessages: 0 });
    mockedGetOrderTypeMatrix.mockResolvedValue({
      rows: [
        {
          orderType: 'onboarding',
          moduleCode: 'onboarding_contact',
          label: '入职联系',
          total: 179,
          processing: 146,
          completed: 28,
          voided: 5,
          withdrawn: 2,
          completionRate: 16.1,
        },
      ],
      total: 1,
    });

    const { getByText } = render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(getByText(/入职联系:16\.1:total=179:processing=146:completed=28:voided=5:withdrawn=2/)).toBeTruthy();
      expect(getByText(/入职管理:16\.1:total=179:processing=146:completed=28:voided=5:withdrawn=2/)).toBeTruthy();
    });
  });

  it('hides in-service matrix rows even when backend returns renewal or benefit data', async () => {
    mockedGetOrderTypeMatrix.mockResolvedValue({
      rows: [
        { orderType: 'renewal', moduleCode: 'renewal_contract', label: '劳动合同续签', total: 5, processing: 5, completed: 0, voided: 0, completionRate: 0 },
        { orderType: 'benefit', moduleCode: 'benefit_apply', label: '待遇申报', total: 4, processing: 1, completed: 3, voided: 0, completionRate: 75 },
        { orderType: 'onboarding', moduleCode: 'social_insurance', label: '社保公积金增员', total: 2, processing: 1, completed: 1, voided: 0, completionRate: 50 },
      ],
      total: 3,
    });

    const { container, getByText } = render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await waitFor(() => expect(getByText(/社保公积金增员:50:/)).toBeTruthy());
    expect(container.textContent).not.toContain('劳动合同续签');
    expect(container.textContent).not.toContain('待遇申报');
    expect(container.textContent).not.toContain('在职管理');
  });

  it('loads backend sub_module configs into leader trend module options while hiding in-service modules', async () => {
    mockedGetModuleConfigs.mockResolvedValue([
      { id: 'cfg-1', module_code: 'social_insurance', module_name: '社保公积金增员', module_type: 'sub_module', is_active: true },
      { id: 'cfg-2', module_code: 'resignation_social_insurance', module_name: '社保公积金减员', module_type: 'sub_module', is_active: true },
      { id: 'cfg-3', module_code: 'renewal_contract', module_name: '劳动合同续签', module_type: 'sub_module', is_active: true },
    ]);
    mockedGetOrderTypeMatrix.mockResolvedValue({
      rows: [
        { orderType: 'onboarding', moduleCode: 'social_insurance', label: '社保公积金增员', total: 2, processing: 1, completed: 1, voided: 0, completionRate: 50 },
      ],
      total: 1,
    });

    const { container, getByText } = render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockedGetModuleConfigs).toHaveBeenCalledWith({ isActive: true });
      expect(getByText('负责人月办结完成率趋势')).toBeTruthy();
      expect(mockedGetLeaderTrend).toHaveBeenCalledWith('onboarding', undefined, undefined, expect.any(AbortSignal), expect.stringMatching(/^\d{4}-\d{2}$/));
      expect(mockedGetLeaderTrend).toHaveBeenCalledWith('resignation', undefined, undefined, expect.any(AbortSignal), expect.stringMatching(/^\d{4}-\d{2}$/));
    });
    expect(container.textContent).not.toContain('在职');
    expect(container.textContent).not.toContain('劳动合同续签');
  });

  it('filters backend dashboard rows to social insurance increase/decrease for social specialist', async () => {
    useUserStore.setState({
      user: {
        id: 'fuqianwen-1',
        username: 'fuqianwen',
        real_name: '傅倩雯',
        email: '',
        phone: '',
        avatar_url: null,
        is_active: true,
        permissions: ['module.social_insurance.manage', 'module.social_insurance_resign.manage'],
        roles: [{ id: 'r-social', code: ROLE.SOCIAL_INSURANCE_SPECIALIST, name: '福保负责人', level: 'member' }],
      },
    });
    mockedGetOrderTypeMatrix.mockResolvedValue({
      rows: [
        { orderType: 'onboarding', moduleCode: 'onboarding_contact', label: '入职联系', total: 7, processing: 7, completed: 0, voided: 0, completionRate: 0 },
        { orderType: 'onboarding', moduleCode: 'contract', label: '劳动合同新签', total: 6, processing: 3, completed: 3, voided: 0, completionRate: 50 },
        { orderType: 'onboarding', moduleCode: 'social_insurance', label: '社保公积金增员', total: 5, processing: 2, completed: 3, voided: 0, completionRate: 60 },
        { orderType: 'resignation', moduleCode: 'social_insurance_resign', label: '社保公积金减员', total: 4, processing: 1, completed: 3, voided: 0, completionRate: 75 },
      ],
      total: 4,
    });

    const { container, getByText } = render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(getByText(/社保公积金增员:60:/)).toBeTruthy();
      expect(getByText(/社保公积金减员:75:/)).toBeTruthy();
    });
    expect(container.textContent).not.toContain('入职联系');
    expect(container.textContent).not.toContain('劳动合同新签');
    expect(container.textContent).not.toContain('增员报岗录入');
    expect(mockedGetModuleConfigs).not.toHaveBeenCalled();
  });
});
