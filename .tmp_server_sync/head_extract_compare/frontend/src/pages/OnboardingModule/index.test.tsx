import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingModule, { getOnboardingModulePermissionState } from './index';
import { DEFAULT_MATRIX } from '@/services/roleActionPermissions';

const mocks = vi.hoisted(() => ({
  latestProTableProps: undefined as any,
  getDispatchedOrders: vi.fn(),
  batchExportDispatchedOrders: vi.fn(),
  downloadDispatchedExport: vi.fn(),
  reload: vi.fn(),
  navigate: vi.fn(),
  moduleCode: 'data_entry',
}));

vi.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children, header }: { children: React.ReactNode; header?: { extra?: React.ReactNode[] } }) => (
    <section>
      {header?.extra}
      {children}
    </section>
  ),
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
  batchExportDispatchedOrders: (...args: unknown[]) => mocks.batchExportDispatchedOrders(...args),
  batchUrgeDispatchedOrders: vi.fn(),
  downloadDispatchedExport: (...args: unknown[]) => mocks.downloadDispatchedExport(...args),
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

  it('reloads and sends selected status with creator filter when header filters change', async () => {
    render(<OnboardingModule />);

    await act(async () => {
      mocks.latestProTableProps.onChange({}, { status: ['processing'], created_by_name: ['张三'] });
    });

    await waitFor(() => expect(mocks.reload).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.getDispatchedOrders).toHaveBeenCalledWith(expect.objectContaining({
      current: 1,
      pageSize: 20,
      module_code: 'data_entry',
      statuses: 'processing',
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
    expect(params.orderMonth).toBeUndefined();
    expect(params.statuses).toBeUndefined();
  });
});

describe('OnboardingModule contract export grouping by esign platform', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.latestProTableProps = undefined;
    mocks.moduleCode = 'contract';
    mocks.getDispatchedOrders.mockResolvedValue({ list: [], total: 0 });
    mocks.downloadDispatchedExport.mockResolvedValue(undefined);
  });

  const selectRows = (rows: Array<Record<string, unknown>>) => {
    const rowSelection = mocks.latestProTableProps.rowSelection as {
      onChange: (keys: unknown[], rows: unknown[]) => void;
    };
    rowSelection.onChange(rows.map((row) => row.id), rows);
  };

  const clickExport = async () => {
    const buttons = mocks.latestProTableProps.toolBarRender() as Array<{ key: string; props: { onClick: () => void } }>;
    const exportButton = buttons.find((button) => button.key === 'export');
    await act(async () => {
      await exportButton!.props.onClick();
    });
  };

  it('downloads one file per platform returned by backend (一次请求，按 files 拆分下载)', async () => {
    mocks.batchExportDispatchedOrders.mockResolvedValue({
      files: [
        { fileId: 'f-sc', fileName: 'sc.xlsx', downloadUrl: '/api/files/f-sc', signPlatform: '速创', count: 2 },
        { fileId: 'f-es', fileName: 'es.xlsx', downloadUrl: '/api/files/f-es', signPlatform: 'E签宝', count: 1 },
      ],
    });
    render(<OnboardingModule />);

    const rows = [
      { id: 'c1', module_code: 'contract', status: 'pending', extra_data: { esign_platform: '速创' } },
      { id: 'c2', module_code: 'contract', status: 'pending', extra_data: { esign_platform: 'E签宝' } },
      { id: 'c3', module_code: 'contract', status: 'pending', extra_data: { esign_platform: '速创' } },
    ];

    await act(async () => {
      selectRows(rows);
    });
    await clickExport();

    // 前端只发一次请求，传入全部选中 id；按平台拆分由后端完成。
    await waitFor(() => expect(mocks.batchExportDispatchedOrders).toHaveBeenCalledTimes(1));
    expect(mocks.batchExportDispatchedOrders.mock.calls[0][0]).toEqual(['c1', 'c2', 'c3']);

    // 后端返回两个文件，前端逐个下载，文件名带平台后缀。
    await waitFor(() => expect(mocks.downloadDispatchedExport).toHaveBeenCalledTimes(2));
    const fileNames = mocks.downloadDispatchedExport.mock.calls.map((call) => call[1] as string);
    expect(fileNames).toEqual(expect.arrayContaining([
      expect.stringContaining('-速创.xlsx'),
      expect.stringContaining('-E签宝.xlsx'),
    ]));
  });

  it('exports a single file when backend returns one platform group', async () => {
    mocks.batchExportDispatchedOrders.mockResolvedValue({
      files: [
        { fileId: 'f-sc', fileName: 'sc.xlsx', downloadUrl: '/api/files/f-sc', signPlatform: '速创', count: 2 },
      ],
    });
    render(<OnboardingModule />);

    const rows = [
      { id: 'c1', module_code: 'contract', status: 'pending', extra_data: { esign_platform: '速创' } },
      { id: 'c2', module_code: 'contract', status: 'pending', extra_data: { esign_platform: '速创' } },
    ];

    await act(async () => {
      selectRows(rows);
    });
    await clickExport();

    await waitFor(() => expect(mocks.batchExportDispatchedOrders).toHaveBeenCalledTimes(1));
    expect(mocks.batchExportDispatchedOrders.mock.calls[0][0]).toEqual(['c1', 'c2']);
    await waitFor(() => expect(mocks.downloadDispatchedExport).toHaveBeenCalledTimes(1));
  });
});


describe('OnboardingModule action permission baseline', () => {
  const hasRoleFactory = (roles: string[]) => (roleCode: string) => roles.includes(roleCode);

  it('keeps business roles as urge-only on sub-work-order modules when structured permissions are present', () => {
    for (const roleCode of ['biz_leader', 'biz_member']) {
      const state = getOnboardingModulePermissionState({
        currentModule: 'contract',
        userPermissions: DEFAULT_MATRIX[roleCode],
        hasRole: hasRoleFactory(roleCode === 'biz_leader' ? ['business_group_leader'] : ['business_group_member']),
      });

      expect(state.canBatchUrge).toBe(true);
      expect(state.canBatchImport).toBe(false);
      expect(state.canBatchExport).toBe(false);
      expect(state.canBatchAccept).toBe(false);
      expect(state.canBatchComplete).toBe(false);
    }
  });

  it('keeps contract and shared roles able to operate contract module', () => {
    for (const roleCode of ['contract_specialist', 'shared_leader']) {
      const state = getOnboardingModulePermissionState({
        currentModule: 'contract',
        userPermissions: DEFAULT_MATRIX[roleCode],
        hasRole: hasRoleFactory(roleCode === 'contract_specialist' ? ['labor_contract_member'] : ['shared_team_owner']),
      });

      expect(state.canBatchImport).toBe(true);
      expect(state.canBatchExport).toBe(true);
      expect(state.canBatchAccept).toBe(true);
      expect(state.canBatchComplete).toBe(true);
      expect(state.canBatchUrge).toBe(false);
    }
  });

  it('keeps onboarding contact role field-import permission only on onboarding contact module', () => {
    const state = getOnboardingModulePermissionState({
      currentModule: 'onboarding_contact',
      userPermissions: DEFAULT_MATRIX.onboarding_specialist,
      hasRole: hasRoleFactory(['onboarding_resignation_member']),
    });

    expect(state.canBatchImportFields).toBe(true);
    expect(state.canBatchImport).toBe(true);
    expect(state.canBatchComplete).toBe(true);
  });

  it('keeps social insurance module using feedback instead of complete permission', () => {
    const state = getOnboardingModulePermissionState({
      currentModule: 'social_insurance',
      userPermissions: DEFAULT_MATRIX.social_insurance_specialist,
      hasRole: hasRoleFactory(['social_insurance_specialist']),
    });

    expect(state.canBatchImport).toBe(true);
    expect(state.canBatchExport).toBe(true);
    expect(state.canBatchAccept).toBe(true);
    expect(state.canBatchComplete).toBe(true);
    expect(DEFAULT_MATRIX.social_insurance_specialist).toContain('dispatched_order.batch_feedback');
    expect(DEFAULT_MATRIX.social_insurance_specialist).not.toContain('dispatched_order.batch_complete');
  });
});
