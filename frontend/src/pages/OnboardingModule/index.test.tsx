import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingModule from './index';

const mocks = vi.hoisted(() => ({
  latestProTableProps: undefined as any,
  getDispatchedOrders: vi.fn(),
  reload: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => children,
  ProTable: (props: {
    actionRef?: { current?: { reload?: () => unknown } };
    request?: (params: Record<string, unknown>, sort: Record<string, unknown>, filters: Record<string, unknown>) => unknown;
    onChange?: (pagination: unknown, filters: Record<string, unknown>) => void;
  }) => {
    mocks.latestProTableProps = props;
    if (props.actionRef) {
      props.actionRef.current = {
        reload: () => {
          mocks.reload();
          return props.request?.({ current: 1, pageSize: 20 }, {}, {});
        },
      };
    }
    return null;
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ moduleCode: 'data_entry' }),
    useNavigate: () => mocks.navigate,
  };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ hasRole: () => true }),
}));

vi.mock('@/components/DispatchedBatchImportModal', () => ({
  default: () => null,
}));

vi.mock('@/services/dispatchedOrders', () => ({
  getDispatchedOrders: (...args: unknown[]) => mocks.getDispatchedOrders(...args),
  batchCompleteDispatchedOrders: vi.fn(),
  batchExportDispatchedOrders: vi.fn(),
  batchUrgeDispatchedOrders: vi.fn(),
  downloadDispatchedExport: vi.fn(),
}));

describe('OnboardingModule header table filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.latestProTableProps = undefined;
    mocks.getDispatchedOrders.mockResolvedValue({ list: [], total: 0 });
  });

  it('reloads and sends a single selected status when status header filter changes', async () => {
    render(<OnboardingModule />);

    await act(async () => {
      mocks.latestProTableProps.onChange({}, { status: ['pending'] });
    });

    await waitFor(() => expect(mocks.reload).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.getDispatchedOrders).toHaveBeenCalledWith(expect.objectContaining({
      current: 1,
      pageSize: 20,
      module_code: 'data_entry',
      statuses: 'pending',
    })));
  });

  it('reloads and sends pending plus processing when the visible processing header filter changes', async () => {
    render(<OnboardingModule />);

    await act(async () => {
      mocks.latestProTableProps.onChange({}, { status: ['pending,processing'] });
    });

    await waitFor(() => expect(mocks.reload).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.getDispatchedOrders).toHaveBeenCalledWith(expect.objectContaining({
      current: 1,
      pageSize: 20,
      module_code: 'data_entry',
      statuses: 'pending,processing',
    })));
  });

  it('reloads and removes statuses when status header filter is cleared', async () => {
    render(<OnboardingModule />);

    await act(async () => {
      mocks.latestProTableProps.onChange({}, { status: ['pending'] });
    });
    await waitFor(() => expect(mocks.getDispatchedOrders).toHaveBeenCalledWith(expect.objectContaining({ statuses: 'pending' })));

    mocks.reload.mockClear();
    mocks.getDispatchedOrders.mockClear();

    await act(async () => {
      mocks.latestProTableProps.onChange({}, { status: [] });
    });

    await waitFor(() => expect(mocks.reload).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.getDispatchedOrders).toHaveBeenCalled());
    const params = mocks.getDispatchedOrders.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(params.module_code).toBe('data_entry');
    expect(params.statuses).toBeUndefined();
  });
});
