import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingModule, { getOnboardingModulePermissionState } from './index';
import { DEFAULT_MATRIX } from '@/services/roleActionPermissions';
import { KEEP_ALIVE_ROUTE_ACTIVATED_EVENT } from '@/utils/listPageState';


const mocks = vi.hoisted(() => ({
  latestProTableProps: undefined as any,
  getDispatchedOrders: vi.fn(),
  batchExportDispatchedOrders: vi.fn(),
  batchReturnDispatchedOrders: vi.fn(),
  downloadDispatchedExport: vi.fn(),
  reload: vi.fn(),
  navigate: vi.fn(),
  moduleCode: 'data_entry',
  userPermissions: ['*'] as string[],
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
  useAuth: () => ({
    hasRole: () => true,
    user: { permissions: mocks.userPermissions },
  }),
}));

vi.mock('@/components/DispatchedBatchImportModal', () => ({
  default: () => null,
}));

vi.mock('@/services/dispatchedOrders', () => ({
  getDispatchedOrders: (...args: unknown[]) => mocks.getDispatchedOrders(...args),
  batchCompleteDispatchedOrders: vi.fn(),
  batchExportDispatchedOrders: (...args: unknown[]) => mocks.batchExportDispatchedOrders(...args),
  batchReturnDispatchedOrders: (...args: unknown[]) => mocks.batchReturnDispatchedOrders(...args),
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

  it('reloads when the cached module list becomes active again', async () => {
    render(<OnboardingModule />);

    await act(async () => {
      window.dispatchEvent(new CustomEvent(KEEP_ALIVE_ROUTE_ACTIVATED_EVENT, {
        detail: { pathname: '/onboarding/data_entry', search: '' },
      }));
    });

    expect(mocks.reload).toHaveBeenCalled();
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

  it('sends the single toolbar keyword to the child-order backend search', async () => {
    render(<OnboardingModule />);
    const initialRequest = mocks.latestProTableProps.request;
    const actions = mocks.latestProTableProps.toolBarRender() as React.ReactElement[];
    render(<>{actions}</>);

    const keywordAction = actions.find((action) => action.key === 'keyword') as React.ReactElement<{
      onSearch?: (value: string) => void;
    }>;
    await act(async () => {
      keywordAction.props.onSearch?.('张三');
    });

    await waitFor(() => expect(mocks.latestProTableProps.request).not.toBe(initialRequest));

    await act(async () => {
      await mocks.latestProTableProps.request({ current: 1, pageSize: 20 }, {}, {});
    });

    expect(mocks.getDispatchedOrders).toHaveBeenLastCalledWith(expect.objectContaining({
      keyword: '张三',
      module_code: 'data_entry',
    }));
  });

  it('shows the workbook 14-column social increase list', () => {
    mocks.moduleCode = 'social_insurance';

    render(<OnboardingModule />);

    const columns = mocks.latestProTableProps.columns as Array<Record<string, any>>;
    const visibleTitles = columns.filter((column) => !column.hideInTable).map((column) => column.title);
    expect(visibleTitles).toEqual([
      '查看', '状态', '参保单位', '员工姓名', '证件号', '缴纳地', '社保起缴月', '公积金起缴月',
      '社保是否办结', '医保是否办结', '公积金是否办结', '社保公积金办理备注', '派发时间', '完成时间',
    ]);
    const insuredUnit = columns.find((column) => column.key === 'insured_unit');
    const fundStartMonth = columns.find((column) => column.key === 'fund_start_month');
    expect(insuredUnit?.renderText(undefined, { extra_data: { contract_subject: '劳动合同主体值' } })).toBe('劳动合同主体值');
    expect(insuredUnit?.renderText(undefined, {
      extra_data: { contractSubject: '劳动合同主体驼峰值', insured_unit: '历史参保单位' },
    })).toBe('劳动合同主体驼峰值');
    expect(fundStartMonth?.renderText(undefined, { extra_data: { startMonth: '2026-08' } })).toBe('2026-08');
  });

  it('shows the workbook 14-column social decrease list', () => {
    mocks.moduleCode = 'social_insurance_resign';

    render(<OnboardingModule />);

    const columns = mocks.latestProTableProps.columns as Array<Record<string, any>>;
    const visibleTitles = columns.filter((column) => !column.hideInTable).map((column) => column.title);
    expect(visibleTitles).toEqual([
      '查看', '状态', '参保单位', '员工姓名', '证件号', '缴纳地', '社保停缴月', '公积金停缴月',
      '社保是否办结', '医保是否办结', '公积金是否办结', '社保公积金办理备注', '派发时间', '完成时间',
    ]);
    const region = columns.find((column) => column.key === 'social_pay_region');
    const fundStopMonth = columns.find((column) => column.key === 'fund_stop_month');
    expect(region?.renderText(undefined, { extra_data: { socialLocation: '宁波' } })).toBe('宁波');
    expect(fundStopMonth?.renderText(undefined, { extra_data: { socialStopMonth: '2026-08' } })).toBe('2026-08');
  });

  it('shows increase reporting status only on the contract list', () => {
    mocks.moduleCode = 'contract';
    const { unmount } = render(<OnboardingModule />);

    let columns = mocks.latestProTableProps.columns as Array<Record<string, any>>;
    const relatedStatus = columns.find((column) => column.key === 'data_entry_status');
    expect(relatedStatus).toBeDefined();
    expect(relatedStatus?.render(undefined, { data_entry_status: 'completed' })).toMatchObject({
      props: { children: '已完成' },
    });

    unmount();
    mocks.moduleCode = 'data_entry';
    render(<OnboardingModule />);
    columns = mocks.latestProTableProps.columns as Array<Record<string, any>>;
    expect(columns.find((column) => column.key === 'data_entry_status')).toBeUndefined();
  });

  it('shows electronic-sign status and paper contract template on the contract list', () => {
    mocks.moduleCode = 'contract';

    render(<OnboardingModule />);

    const columns = mocks.latestProTableProps.columns as Array<Record<string, any>>;
    const esignStatus = columns.find((column) => column.key === 'need_esign');
    expect(esignStatus?.title).toBe('是否电子签');
    expect(esignStatus?.renderText(undefined, { extra_data: { need_esign: '1.是' } })).toBe('1.是');
    expect(esignStatus?.renderText(undefined, { extra_data: { need_esign: '2.否' } })).toBe('2.否');
    expect(esignStatus?.renderText(undefined, { extra_data: {} })).toBe('-');

    const specialTemplate = columns.find((column) => column.key === 'special_contract_template_name');
    expect(specialTemplate?.title).toBe('特殊合同模板名称');
    expect(specialTemplate?.renderText(undefined, { extra_data: { special_contract_template_name: '劳动合同特殊版' } })).toBe('劳动合同特殊版');
    expect(specialTemplate?.renderText(undefined, { extra_data: {} })).toBe('-');
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

describe('OnboardingModule payroll bank card export list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.latestProTableProps = undefined;
    mocks.moduleCode = 'payroll_bank_card';
    mocks.getDispatchedOrders.mockResolvedValue({ list: [], total: 0 });
  });

  it('shows only directly exportable bank-card fields and export controls', () => {
    render(<OnboardingModule />);

    const columns = mocks.latestProTableProps.columns as Array<Record<string, unknown>>;
    const visibleTitles = columns.filter((column) => !column.hideInTable).map((column) => column.title);
    expect(visibleTitles).toEqual([
      '姓名', '证件号码', '是否需要工资单', '资料状态', '开户行', '银行账号', '开户地', '商社代码', '发薪地',
    ]);
    expect(visibleTitles).not.toEqual(expect.arrayContaining([
      '查看', '状态', '资料状态', '派发时间', '完成时间',
    ]));

    expect(mocks.latestProTableProps.headerTitle).toBe('薪酬银行卡记录');
    const actions = mocks.latestProTableProps.toolBarRender() as React.ReactElement[];
    expect(actions.map((action) => action.key)).toEqual(['keyword', 'columns', 'export']);
    expect(mocks.latestProTableProps.rowSelection).toBeDefined();
    expect(mocks.latestProTableProps.rowSelection.getCheckboxProps({
      id: 'payroll-1',
      module_code: 'payroll_bank_card',
      status: 'pending',
      extra_data: {
        bank_name: '中国银行',
        bank_account: '6222000000000000',
        bank_location: '宁波',
        payroll_location: '宁波',
      },
    })).toEqual({ disabled: false });
    expect(mocks.latestProTableProps.tableAlertRender).not.toBe(false);
  });
});

describe('OnboardingModule resignation certificate list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.latestProTableProps = undefined;
    mocks.moduleCode = 'resignation_cert';
    mocks.getDispatchedOrders.mockResolvedValue({ list: [], total: 0 });
  });

  it('offers batch resignation-certificate export without fixed-template wording', () => {
    render(<OnboardingModule />);

    expect(mocks.latestProTableProps.headerTitle).toBe('离职证明子工单列表');
    const actions = mocks.latestProTableProps.toolBarRender() as React.ReactElement[];
    const keys = actions.map((action) => action.key);
    expect(keys).toEqual(expect.arrayContaining(['columns', 'export']));
    expect(keys).not.toEqual(expect.arrayContaining(['import-status', 'batch', 'batch-return']));
    render(<>{actions}</>);
    expect(screen.getByRole('button', { name: /批量导出离职证明/ })).toBeInTheDocument();
    expect(screen.queryByText(/按固定模板导出/)).not.toBeInTheDocument();
  });
});

describe('OnboardingModule batch return', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.latestProTableProps = undefined;
    mocks.moduleCode = 'contract';
    mocks.getDispatchedOrders.mockResolvedValue({ list: [], total: 0 });
    mocks.batchReturnDispatchedOrders.mockResolvedValue({ success: true, returned: 1, skipped: [] });
  });

  it('submits only active rows from a mixed-status selection', async () => {
    render(<OnboardingModule />);

    const tableAlert = mocks.latestProTableProps.tableAlertRender as (props: Record<string, unknown>) => React.ReactNode;
    render(tableAlert({
      selectedRowKeys: ['returned-order', 'processing-order'],
      selectedRows: [
        { id: 'returned-order', module_code: 'contract', status: 'returned' },
        { id: 'processing-order', module_code: 'contract', status: 'processing' },
      ],
      onCleanSelected: vi.fn(),
    }));

    fireEvent.click(screen.getByRole('button', { name: /批量退回（1）/ }));
    fireEvent.change(await screen.findByPlaceholderText('请输入退回原因'), {
      target: { value: '材料信息不一致' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认退回' }));

    await waitFor(() => expect(mocks.batchReturnDispatchedOrders).toHaveBeenCalledWith(
      ['processing-order'],
      '材料信息不一致',
    ));
    await waitFor(() => expect(mocks.reload).toHaveBeenCalledTimes(1));
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
      expect(state.canBatchReturn).toBe(false);
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
      expect(state.canBatchReturn).toBe(true);
      expect(state.canBatchUrge).toBe(false);
    }
  });

  it('limits resignation certificate list to accept and return actions', () => {
    for (const roleCode of ['contract_specialist', 'shared_leader']) {
      const state = getOnboardingModulePermissionState({
        currentModule: 'resignation_cert',
        userPermissions: DEFAULT_MATRIX[roleCode],
        hasRole: hasRoleFactory(roleCode === 'contract_specialist' ? ['labor_contract_member'] : ['shared_team_owner']),
      });

      expect(state.canBatchAccept).toBe(false);
      expect(state.canBatchReturn).toBe(false);
      expect(state.canBatchImport).toBe(false);
      expect(state.canBatchExport).toBe(true);
      expect(state.canBatchComplete).toBe(false);
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

  it('binds payroll bank-card visibility and export to one configured module permission', () => {
    const unconfigured = getOnboardingModulePermissionState({
      currentModule: 'payroll_bank_card',
      userPermissions: DEFAULT_MATRIX.data_entry_leader,
      hasRole: hasRoleFactory(['data_entry_leader']),
    });
    expect(unconfigured.canOperateCurrentModule).toBe(false);
    expect(unconfigured.canSelectRows).toBe(false);

    const configured = getOnboardingModulePermissionState({
      currentModule: 'payroll_bank_card',
      userPermissions: ['route.onboarding', 'route.onboarding_payroll_bank_card', 'module.payroll_bank_card.manage'],
      hasRole: hasRoleFactory(['payroll_bank_card_exporter']),
    });
    expect(configured).toMatchObject({ canOperateCurrentModule: true, canBatchExport: true, canSelectRows: true });

    const salesperson = getOnboardingModulePermissionState({
      currentModule: 'payroll_bank_card',
      userPermissions: ['route.onboarding'],
      hasRole: hasRoleFactory(['business_group_member']),
    });
    expect(salesperson).toMatchObject({ canOperateCurrentModule: true, canBatchExport: true, canSelectRows: true });

    const admin = getOnboardingModulePermissionState({
      currentModule: 'payroll_bank_card',
      userPermissions: DEFAULT_MATRIX.admin,
      hasRole: hasRoleFactory(['admin']),
    });
    expect(admin).toMatchObject({
      canOperateCurrentModule: true,
      canBatchImport: false,
      canBatchImportFields: false,
      canBatchExport: true,
      canBatchAccept: false,
      canBatchComplete: false,
      canBatchReturn: false,
      canBatchUrge: false,
      canSelectRows: true,
    });
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
