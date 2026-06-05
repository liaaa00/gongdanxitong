import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import TeamDispatched from './index';

const mocks = vi.hoisted(() => ({
  latestProTableProps: undefined as any,
  getDispatchedOrdersSafe: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => children,
  ProTable: (props: any) => {
    mocks.latestProTableProps = props;
    return null;
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});

vi.mock('@/services/dispatchedOrders', () => ({
  getDispatchedOrdersSafe: (...args: unknown[]) => mocks.getDispatchedOrdersSafe(...args),
}));

const currentDir = dirname(fileURLToPath(import.meta.url));
const oldMainOrderService = '@/services/' + 'workOrders';
const oldMainOrderFetcher = 'get' + 'WorkOrders';
const oldMainOrderType = 'Work' + 'OrderItem';
const oldMainDetailRoute = '`/work' + '-orders/${record.id}`';

describe('TeamDispatched readonly child-order view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.latestProTableProps = undefined;
    mocks.getDispatchedOrdersSafe.mockResolvedValue({ list: [], total: 0 });
  });

  function getColumn(dataIndexOrKey: string) {
    const columns = mocks.latestProTableProps.columns as Array<Record<string, any>>;
    return columns.find((column) => column.dataIndex === dataIndexOrKey || column.key === dataIndexOrKey);
  }

  it('uses the same table configuration style as my-work child pages', async () => {
    render(<TeamDispatched />);

    expect(mocks.latestProTableProps.search).toBe(false);
    expect(getColumn('order_no')?.title).toBe('编号');
    expect(getColumn('employee_name')?.title).toBe('员工姓名');
    expect(getColumn('moduleCode')?.title).toBe('工单类型');
    expect(getColumn('createdByName')?.title).toBe('发起人');
    expect(getColumn('handlerName')?.title).toBe('实际操作人/配置负责人');

    await mocks.latestProTableProps.request({ current: 1, pageSize: 20, order_no: 'WO-001', customer_name: '客户A' });

    await waitFor(() => expect(mocks.getDispatchedOrdersSafe).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      pageSize: 20,
      orderNo: 'WO-001',
      customerName: '客户A',
      orderMonth: expect.stringMatching(/^\d{4}-\d{2}$/),
      scope: 'team',
    })));
  });

  it('merges table header filters into team request params', async () => {
    render(<TeamDispatched />);

    await mocks.latestProTableProps.request(
      { current: 1, pageSize: 20 },
      {},
      { createdByName: ['张三'], handlerName: ['李四'], status: ['completed'], moduleCode: ['contract'] },
    );

    await waitFor(() => expect(mocks.getDispatchedOrdersSafe).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      pageSize: 20,
      createdByName: '张三',
      handlerName: '李四',
      status: 'completed',
      moduleCode: 'contract',
      orderMonth: expect.stringMatching(/^\d{4}-\d{2}$/),
      scope: 'team',
    })));
  });

  it('normalizes pending/processing status filter to the shared statuses query', async () => {
    render(<TeamDispatched />);

    await mocks.latestProTableProps.request(
      { current: 1, pageSize: 20 },
      {},
      { status: ['pending,processing'] },
    );

    await waitFor(() => expect(mocks.getDispatchedOrdersSafe).toHaveBeenCalledWith(expect.objectContaining({
      statuses: 'pending,processing',
      scope: 'team',
    })));
    expect(mocks.getDispatchedOrdersSafe.mock.calls.at(-1)?.[0]).not.toHaveProperty('status');
  });

  it('does not depend on the main work-order API or main detail route', () => {
    const source = readFileSync(join(currentDir, 'index.tsx'), 'utf8');

    expect(source).toContain('getDispatchedOrdersSafe');
    expect(source).toContain("scope: 'team'");
    expect(source).not.toContain(oldMainOrderService);
    expect(source).not.toContain(oldMainOrderFetcher);
    expect(source).not.toContain(oldMainOrderType);
    expect(source).not.toContain(oldMainDetailRoute);
  });

  it('opens actionable dispatched detail from team work list', () => {
    render(<TeamDispatched />);

    const actions = getColumn('actions');
    const link = actions?.render?.(null, { id: 'd-1' }) as React.ReactElement;
    link.props.onClick();

    expect(mocks.navigate).toHaveBeenCalledWith('/my-dispatched/d-1');
  });

  it('filters out in-service child modules in phase one while keeping onboarding and resignation rows', async () => {
    mocks.getDispatchedOrdersSafe.mockResolvedValue({
      list: [
        { id: 'contact', module_code: 'onboarding_contact', order_type: 'onboarding' },
        { id: 'social-minus', module_code: 'social_insurance_resign', order_type: 'resignation' },
        { id: 'renewal', module_code: 'renewal_contract', order_type: 'renewal' },
        { id: 'benefit', module_code: 'benefit_apply', order_type: 'benefit' },
      ],
      total: 4,
    });
    render(<TeamDispatched />);

    const result = await mocks.latestProTableProps.request({ current: 1, pageSize: 20 });

    expect(result.data.map((row: { id: string }) => row.id)).toEqual(['contact', 'social-minus']);
    expect(result.total).toBe(4);
  });
});
