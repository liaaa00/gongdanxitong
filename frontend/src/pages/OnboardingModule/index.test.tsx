import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingModule from './index';

const mocks = vi.hoisted(() => ({
  latestProTableProps: undefined as any,
  getDispatchedOrders: vi.fn(),
  reload: vi.fn(),
  navigate: vi.fn(),
  moduleCode: 'data_entry',
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
    useParams: () => ({ moduleCode: mocks.moduleCode }),
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
    mocks.moduleCode = 'data_entry';
    mocks.getDispatchedOrders.mockResolvedValue({ list: [], total: 0 });
  });

  it('reloads and sends a single selected status when status header filter changes', async () => {
    render(<OnboardingModule />);

    const creatorColumn = (mocks.latestProTableProps.columns as Array<Record<string, unknown>>).find((column) => column.key === 'created_by_name');
    expect(creatorColumn?.title).toBe('发起人');

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

  it('reloads and sends pending plus processing with creator filter when header filters change', async () => {
    render(<OnboardingModule />);

    await act(async () => {
      mocks.latestProTableProps.onChange({}, { status: ['pending,processing'], created_by_name: ['张三'] });
    });

    await waitFor(() => expect(mocks.reload).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.getDispatchedOrders).toHaveBeenCalledWith(expect.objectContaining({
      current: 1,
      pageSize: 20,
      module_code: 'data_entry',
      statuses: 'pending,processing',
      createdByName: '张三',
    })));
  });

  it('maps social_insurance_resign route to backend resignation_social_insurance module code', async () => {
    mocks.moduleCode = 'social_insurance_resign';

    render(<OnboardingModule />);

    await act(async () => {
      await mocks.latestProTableProps.request({ current: 1, pageSize: 20 }, {}, {});
    });

    await waitFor(() => expect(mocks.getDispatchedOrders).toHaveBeenCalledWith(expect.objectContaining({
      current: 1,
      pageSize: 20,
      module_code: 'resignation_social_insurance',
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
