import React from 'react';
import { cleanup, render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MyDispatchedDetail from './index';

const mocks = vi.hoisted(() => ({
  getDispatchedOrder: vi.fn(),
  getDispatchedOrderTimeline: vi.fn(),
  confirmDispatchedDirtyRead: vi.fn(),
  getFields: vi.fn(),
  getFallbackFields: vi.fn(),
  getSupplementLogs: vi.fn(),
  getActiveDetailViewTemplate: vi.fn(),
  supplementField: vi.fn(),
  resubmitDispatchedOrder: vi.fn(),
  navigate: vi.fn(),
  confirm: vi.fn(),
  message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  notification: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  fieldPermissions: { employee_name: 'visible' } as Record<string, 'visible' | 'hidden' | 'readonly' | 'masked'>,
  currentUser: {
    id: 'creator-1',
    username: 'creator',
    real_name: '发起人',
    roles: [{ code: 'business_group_member' }],
  },
}));

vi.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children, header, loading }: { children?: React.ReactNode; header?: { title?: string; extra?: React.ReactNode[] }; loading?: boolean }) => (
    <div>
      {loading ? <div>loading</div> : null}
      {header?.title ? <h1>{header.title}</h1> : null}
      {header?.extra?.map((item, index) => <React.Fragment key={index}>{item}</React.Fragment>)}
      {children}
    </div>
  ),
}));

vi.mock('@/components/DynamicForm', () => ({
  default: ({ readOnly }: { readOnly?: boolean }) => <div data-testid="dynamic-form" data-readonly={String(readOnly)} />,
}));

vi.mock('@/hooks/useFieldPermissions', () => ({
  useFieldPermissions: () => ({ permissions: mocks.fieldPermissions }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mocks.currentUser,
    hasRole: (role: string) => mocks.currentUser.roles.some((item: { code: string }) => item.code === role),
  }),
}));

vi.mock('@/services/dispatchedOrders', () => ({
  getDispatchedOrder: (...args: unknown[]) => mocks.getDispatchedOrder(...args),
  getDispatchedOrderTimeline: (...args: unknown[]) => mocks.getDispatchedOrderTimeline(...args),
  confirmDispatchedDirtyRead: (...args: unknown[]) => mocks.confirmDispatchedDirtyRead(...args),
  returnCompletedDispatchedOrder: vi.fn(),
  acceptDispatchedOrder: vi.fn(),
  completeDispatchedOrder: vi.fn(),
  returnDispatchedOrder: vi.fn(),
  supplementField: (...args: unknown[]) => mocks.supplementField(...args),
  exportDispatchedOrder: vi.fn(),
  downloadDispatchedExport: vi.fn(),
  reassignDispatchedOrder: vi.fn(),
  creatorUpdateDispatchedOrderFields: vi.fn(),
  resubmitDispatchedOrder: (...args: unknown[]) => mocks.resubmitDispatchedOrder(...args),
  urgeDispatchedOrder: vi.fn(),
  withdrawDispatchedOrder: vi.fn(),
  voidDispatchedOrder: vi.fn(),
  approveWithdrawDispatchedOrder: vi.fn(),
  approveVoidDispatchedOrder: vi.fn(),
}));

vi.mock('@/services/fields', () => ({
  getFields: (...args: unknown[]) => mocks.getFields(...args),
  getFallbackFields: (...args: unknown[]) => mocks.getFallbackFields(...args),
}));

vi.mock('@/services/supplementLogs', () => ({
  getSupplementLogs: (...args: unknown[]) => mocks.getSupplementLogs(...args),
}));

vi.mock('@/services/detailViewTemplates', () => ({
  getActiveDetailViewTemplate: (...args: unknown[]) => mocks.getActiveDetailViewTemplate(...args),
}));

vi.mock('@/services/users', () => ({ getUsersByTeam: vi.fn() }));
vi.mock('@/services/upload', () => ({ uploadOrderAttachment: vi.fn() }));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});

vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');
  return {
    ...(actual as object),
    App: {
      ...((actual as Record<string, unknown>).App as object),
      useApp: () => ({
        message: mocks.message,
        notification: mocks.notification,
        modal: { confirm: mocks.confirm },
      }),
    },
  };
});

const fields = [
  {
    field_code: 'employee_name',
    field_name: '员工姓名',
    field_type: 'text',
    is_required: true,
    is_active: true,
    display_order: 1,
    collection_group: 'basic',
  },
  {
    field_code: 'base_salary',
    field_name: '基本工资',
    field_type: 'text',
    is_required: true,
    is_active: true,
    display_order: 2,
    collection_group: 'salary',
  },
  {
    field_code: 'bank_name',
    field_name: '开户银行',
    field_type: 'text',
    is_required: false,
    is_active: true,
    display_order: 2,
    collection_group: 'basic',
  },
  {
    field_code: 'custom_template_only',
    field_name: '模板专用字段',
    field_type: 'text',
    is_required: false,
    is_active: true,
    display_order: 3,
    collection_group: 'custom',
  },
  {
    field_code: 'company_address',
    field_name: '甲方住所',
    field_type: 'text',
    is_required: false,
    is_active: true,
    display_order: 4,
    collection_group: 'contract',
  },
  {
    field_code: 'project_name',
    field_name: '项目名称',
    field_type: 'text',
    is_required: false,
    is_active: true,
    display_order: 5,
    collection_group: 'contract',
  },
  {
    field_code: 'contract_subject',
    field_name: '劳动合同主体',
    field_type: 'text',
    is_required: false,
    is_active: true,
    display_order: 6,
    collection_group: 'contract',
  },
  {
    field_code: 'contract_template',
    field_name: '劳动合同模板（标准模板/特殊模板）',
    field_type: 'text',
    is_required: false,
    is_active: true,
    display_order: 7,
    collection_group: 'contract',
  },
  {
    field_code: 'gender',
    field_name: '性别',
    field_type: 'text',
    is_required: false,
    is_active: true,
    display_order: 8,
    collection_group: 'basic',
  },
  {
    field_code: 'birth_date',
    field_name: '出生日期',
    field_type: 'date',
    is_required: false,
    is_active: true,
    display_order: 9,
    collection_group: 'basic',
  },
  {
    field_code: 'age',
    field_name: '年龄',
    field_type: 'number',
    is_required: false,
    is_active: true,
    display_order: 10,
    collection_group: 'basic',
  },
  {
    field_code: 'probation_end_date',
    field_name: '试用期结束日期',
    field_type: 'date',
    is_required: false,
    is_active: true,
    display_order: 11,
    collection_group: 'contract',
  },
];

const baseOrder = {
  id: 'd-1',
  parent_order_id: 'wo-1',
  parent_order: { id: 'wo-1', created_by: 'creator-1' },
  order_no: 'ON-001',
  module_code: 'contract',
  module_name: '劳动合同新签',
  status: 'processing',
  handler_id: null,
  handler_name: null,
  employee_name: '张三',
  customer_name: '客户A',
  visible_fields: ['employee_name'],
  return_reason: null,
  extra_data: { employee_name: '张三' },
  dispatched_at: null,
  accepted_at: null,
  completed_at: null,
  created_at: '2026-06-01T00:00:00Z',
  dirty_fields: [],
  has_unread_dirty: false,
};

function renderDetail(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/my-dispatched/:id" element={<MyDispatchedDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MyDispatchedDetail readonly and creator repair actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser = {
      id: 'creator-1',
      username: 'creator',
      real_name: '发起人',
      roles: [{ code: 'business_group_member' }],
    };
    mocks.fieldPermissions = { employee_name: 'visible' };
    mocks.getFields.mockResolvedValue(fields);
    mocks.getFallbackFields.mockReturnValue(fields);
    mocks.getSupplementLogs.mockResolvedValue([]);
    mocks.getDispatchedOrderTimeline.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
    mocks.resubmitDispatchedOrder.mockResolvedValue({ ...baseOrder, status: 'pending' });
    mocks.getActiveDetailViewTemplate.mockResolvedValue(null);
    mocks.getDispatchedOrder.mockResolvedValue(baseOrder);
  });

  afterEach(() => {
    cleanup();
  });

  it.each([
    {
      label: 'business creator',
      user: { id: 'creator-1', username: 'creator', real_name: '发起人', roles: [{ code: 'business_group_member' }] },
    },
    {
      label: 'backend handler',
      user: { id: 'handler-1', username: 'handler', real_name: '办理人', roles: [{ code: 'labor_contract_member' }] },
    },
  ])('shows pending old and new values with reason to $label', async ({ user }) => {
    mocks.currentUser = user;
    mocks.getDispatchedOrder.mockResolvedValue({
      ...baseOrder,
      status: 'modify_pending',
      pending_modify: {
        fields: { employee_name: '李四' },
        reason: '修正员工姓名',
      },
    });

    renderDetail('/my-dispatched/d-1');

    expect(await screen.findByText('修改原因：修正员工姓名')).toBeInTheDocument();
    expect(screen.getByText(/张三\s*→\s*李四/)).toBeInTheDocument();
  });

  it('masks both pending old and new values for masked fields', async () => {
    mocks.fieldPermissions = { base_salary: 'masked' };
    mocks.getDispatchedOrder.mockResolvedValue({
      ...baseOrder,
      status: 'modify_pending',
      visible_fields: ['base_salary'],
      extra_data: { base_salary: '¥2,600.00' },
      pending_modify: {
        fields: { base_salary: '¥3,000.00' },
        reason: '调整工资',
      },
    });

    renderDetail('/my-dispatched/d-1');

    expect(await screen.findByText(/\*+\s*→\s*\*+/)).toBeInTheDocument();
    expect(screen.queryByText('¥2,600.00')).not.toBeInTheDocument();
    expect(screen.queryByText('¥3,000.00')).not.toBeInTheDocument();
  });

  it('uses backend field metadata for non-admin detail and keeps visible_fields filtering', async () => {
    mocks.currentUser = {
      id: 'handler-1',
      username: 'handler',
      real_name: 'handler',
      roles: [{ code: 'social_insurance_specialist' }],
    };
    const backendOnlyFields = [
      {
        field_code: 'backend_only_field',
        field_name: 'Backend Only Field',
        field_type: 'text',
        is_required: false,
        is_active: true,
        display_order: 1,
        collection_group: 'test',
      },
    ];
    const fallbackOnlyFields = [
      {
        field_code: 'fallback_only_field',
        field_name: 'Fallback Only Field',
        field_type: 'text',
        is_required: false,
        is_active: true,
        display_order: 1,
        collection_group: 'test',
      },
    ];
    mocks.getFields.mockResolvedValue(backendOnlyFields);
    mocks.getFallbackFields.mockReturnValue(fallbackOnlyFields);
    mocks.getDispatchedOrder.mockResolvedValue({
      ...baseOrder,
      module_code: 'social_insurance',
      module_name: 'Social Insurance',
      visible_fields: ['backend_only_field'],
      extra_data: {
        backend_only_field: 'backend value',
        fallback_only_field: 'fallback value',
      },
    });

    renderDetail('/my-dispatched/d-1');

    await waitFor(() => expect(mocks.getFields).toHaveBeenCalledWith('onboarding'));
    expect(mocks.getFallbackFields).toHaveBeenCalledWith('onboarding');
    expect(await screen.findByText('Backend Only Field')).toBeInTheDocument();
    expect(screen.getByText('backend value')).toBeInTheDocument();
    expect(screen.queryByText('Fallback Only Field')).not.toBeInTheDocument();
    expect(screen.queryByText('fallback value')).not.toBeInTheDocument();
  });
  it('falls back to local field metadata when backend field metadata request fails', async () => {
    const fallbackOnlyFields = [
      {
        field_code: 'fallback_only_field',
        field_name: 'Fallback Only Field',
        field_type: 'text',
        is_required: false,
        is_active: true,
        display_order: 1,
        collection_group: 'test',
      },
    ];
    mocks.getFields.mockRejectedValue(new Error('field metadata unavailable'));
    mocks.getFallbackFields.mockReturnValue(fallbackOnlyFields);
    mocks.getDispatchedOrder.mockResolvedValue({
      ...baseOrder,
      module_code: 'social_insurance',
      module_name: 'Social Insurance',
      visible_fields: ['fallback_only_field'],
      extra_data: { fallback_only_field: 'fallback value' },
    });

    renderDetail('/my-dispatched/d-1');

    await waitFor(() => expect(mocks.getFields).toHaveBeenCalledWith('onboarding'));
    expect(await screen.findByText('Fallback Only Field')).toBeInTheDocument();
    expect(screen.getByText('fallback value')).toBeInTheDocument();
  });
  it('uses the active detail template fields for contract detail', async () => {
    mocks.getActiveDetailViewTemplate.mockResolvedValue({
      id: 'detail-contract',
      template_name: '劳动合同',
      module_code: 'contract',
      field_list: [
        { field_code: 'company_address' },
        { field_code: 'project_name' },
        { field_code: 'contract_template' },
      ],
    });
    mocks.getDispatchedOrder.mockResolvedValue({
      ...baseOrder,
      module_code: 'contract',
      visible_fields: ['employee_name'],
      extra_data: {
        employee_name: '张三',
        company_address: '甲方地址',
        project_name: '项目A',
        contract_template: '标准模板',
        birth_date: '1990-01-01',
      },
    });

    renderDetail('/my-dispatched/d-1');

    await waitFor(() => expect(mocks.getActiveDetailViewTemplate).toHaveBeenCalledWith('contract'));
    expect(document.body).toHaveTextContent('甲方住所');
    expect(document.body).toHaveTextContent('甲方地址');
    expect(document.body).toHaveTextContent('项目名称');
    expect(document.body).toHaveTextContent('项目A');
    expect(document.body).toHaveTextContent('劳动合同模板（标准模板/特殊模板）');
    expect(document.body).toHaveTextContent('标准模板');
    expect(document.body).not.toHaveTextContent('员工姓名');
    expect(document.body).not.toHaveTextContent('出生日期');
  });

  it('falls back to child visible fields when the contract detail template is unavailable', async () => {
    mocks.getDispatchedOrder.mockResolvedValue({
      ...baseOrder,
      module_code: 'contract',
      visible_fields: ['employee_name', 'bank_name'],
      extra_data: { employee_name: '张三', bank_name: '测试银行' },
    });

    renderDetail('/my-dispatched/d-1');

    await waitFor(() => expect(mocks.getActiveDetailViewTemplate).toHaveBeenCalledWith('contract'));
    fireEvent.click(await screen.findByRole('button', { name: /修改/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('员工姓名')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('开户银行')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('出生日期')).not.toBeInTheDocument();
  });

  it('hides all operation buttons when opened from team readonly detail and ignores auto edit action', async () => {
    mocks.getDispatchedOrder.mockResolvedValue({ ...baseOrder, status: 'returned', return_reason: '字段需修改' });

    renderDetail('/my-dispatched/d-1?readonly=1&from=team&action=edit');

    await waitFor(() => expect(mocks.getDispatchedOrder).toHaveBeenCalledWith('d-1'));
    expect(screen.queryByText('团队工单只读详情')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /修改/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /重新提交/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /作废/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /接单/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /完成/ })).not.toBeInTheDocument();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it('hides all operation buttons only when my-work link explicitly requests readonly', async () => {
    mocks.currentUser = {
      id: 'handler-1',
      username: 'handler',
      real_name: '后道',
      roles: [{ code: 'social_insurance_specialist' }],
    };
    mocks.getDispatchedOrder.mockResolvedValue({
      ...baseOrder,
      module_code: 'social_insurance',
      module_name: '社保公积金增员',
      status: 'pending',
      handler_id: 'handler-1',
    });

    renderDetail('/my-dispatched/d-1?readonly=1&from=my-work');

    await waitFor(() => expect(mocks.getDispatchedOrder).toHaveBeenCalledWith('d-1'));
    expect(screen.queryByText('我的工单只读详情')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /接单/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /完成/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /退回/ })).not.toBeInTheDocument();
  });

  it('allows backend user to operate when opened from my-work without readonly flag', async () => {
    mocks.currentUser = {
      id: 'handler-1',
      username: 'handler',
      real_name: '后道',
      roles: [{ code: 'social_insurance_specialist' }],
    };
    mocks.getDispatchedOrder.mockResolvedValue({
      ...baseOrder,
      module_code: 'social_insurance',
      module_name: '社保公积金增员',
      status: 'pending',
      handler_id: 'handler-1',
    });

    renderDetail('/my-dispatched/d-1?from=my-work');

    expect(await screen.findByRole('button', { name: /接单/ })).toBeInTheDocument();
    expect(screen.queryByText('我的工单只读详情')).not.toBeInTheDocument();
  });

  it('collects an optional reason when a returned child order is resubmitted', async () => {
    mocks.getDispatchedOrder.mockResolvedValue({
      ...baseOrder,
      status: 'returned',
      return_reason: '离职日期不一致，请业务员确认',
    });

    renderDetail('/my-dispatched/d-1');

    fireEvent.click(await screen.findByRole('button', { name: /重新提交/ }));
    const dialog = await screen.findByRole('dialog');
    const reasonInput = within(dialog).getByLabelText('重新提交原因');
    fireEvent.change(reasonInput, { target: { value: '  以员工辞职报告真实日期为准  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '重新提交' }));

    await waitFor(() => expect(mocks.resubmitDispatchedOrder).toHaveBeenCalledWith('d-1', {
      moduleCode: 'contract',
      reason: '以员工辞职报告真实日期为准',
    }));
  });

  it('does not resubmit when the reason dialog is cancelled', async () => {
    mocks.getDispatchedOrder.mockResolvedValue({ ...baseOrder, status: 'withdrawn' });

    renderDetail('/my-dispatched/d-1');

    fireEvent.click(await screen.findByRole('button', { name: /重新提交/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /取\s*消/ }));

    expect(mocks.resubmitDispatchedOrder).not.toHaveBeenCalled();
  });

  it('loads the current child processing timeline only after the collapsed section is opened', async () => {
    mocks.getDispatchedOrderTimeline.mockResolvedValue({
      items: [
        {
          id: 'log-1', createdAt: '2026-07-18T01:00:00.000Z', operatorId: 'handler-1', operatorName: '毛雅妮',
          actionType: 'return', actionLabel: '退回子工单', description: '退回处理中子工单',
          reason: '离职日期不一致', changes: [],
        },
        {
          id: 'log-2', createdAt: '2026-07-18T01:05:00.000Z', operatorId: 'creator-1', operatorName: '业务员甲',
          actionType: 'creator_update_fields', actionLabel: '修改工单', description: '业务员修改子工单字段',
          reason: '修正离职日期', changes: [{ fieldCode: 'employee_name', fieldLabel: '员工姓名', oldValue: '张三', newValue: '李四' }],
        },
        {
          id: 'log-3', createdAt: '2026-07-18T01:10:00.000Z', operatorId: 'creator-1', operatorName: '业务员甲',
          actionType: 'creator_resubmit', actionLabel: '重新提交', description: '业务员重新提交子工单',
          reason: '以员工辞职报告真实日期为准', changes: [],
        },
      ],
      total: 3,
      page: 1,
      pageSize: 50,
    });

    renderDetail('/my-dispatched/d-1');

    expect(await screen.findByText('工单处理日志')).toBeInTheDocument();
    expect(mocks.getDispatchedOrderTimeline).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('工单处理日志'));

    await waitFor(() => expect(mocks.getDispatchedOrderTimeline).toHaveBeenCalledWith('d-1', { page: 1, pageSize: 50 }));


    expect(await screen.findByText(/离职日期不一致/)).toBeInTheDocument();
    expect(screen.getByText(/修正离职日期/)).toBeInTheDocument();
    expect(screen.getByText(/以员工辞职报告真实日期为准/)).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('.ant-collapse-content-box')).toHaveTextContent(
      /员工姓名：\s*张三\s*→\s*李四/,
    ));
  });

  it('shows child-level modify and resubmit actions for creator on void child order', async () => {
    mocks.getDispatchedOrder.mockResolvedValue({
      ...baseOrder,
      status: 'void',
      void_at: '2026-06-01T10:00:00Z',
    });

    renderDetail('/my-dispatched/d-1');

    await waitFor(() => expect(mocks.getDispatchedOrder).toHaveBeenCalledWith('d-1'));
    expect(await screen.findByRole('button', { name: /重新提交/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /撤回/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /催办/ })).not.toBeInTheDocument();
  });

  it('allows creator to modify, withdraw and void social insurance child before it is accepted', async () => {
    mocks.getDispatchedOrder.mockResolvedValue({
      ...baseOrder,
      module_code: 'social_insurance',
      module_name: '社保公积金增员',
      status: 'pending',
      accepted_at: null,
    });

    renderDetail('/my-dispatched/d-1');

    expect(await screen.findByRole('button', { name: /修改/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /撤回/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /作废/ })).toBeInTheDocument();
    expect(screen.queryByText('社保公积金子工单已接单/已受理')).not.toBeInTheDocument();
  });

  it('allows creator to submit approval actions after backend accepted the child order', async () => {
    mocks.getDispatchedOrder.mockResolvedValue({
      ...baseOrder,
      module_code: 'social_insurance',
      module_name: '社保公积金增员',
      status: 'processing',
      accepted_at: '2026-06-01T09:00:00Z',
    });

    renderDetail('/my-dispatched/d-1');

    expect(await screen.findByRole('button', { name: /修改/ })).toBeInTheDocument();
    expect(screen.queryByText('该子工单已接单')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /撤回/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /作废/ })).toBeInTheDocument();
  });

  it('allows creator to request modify, withdraw and void after the child is completed', async () => {
    mocks.getDispatchedOrder.mockResolvedValue({
      ...baseOrder,
      status: 'completed',
      accepted_at: '2026-06-01T09:00:00Z',
      completed_at: '2026-06-01T10:00:00Z',
    });

    renderDetail('/my-dispatched/d-1');

    expect(await screen.findByRole('button', { name: /修改/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /撤回/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /作废/ })).toBeInTheDocument();
  });

  it('allows the assigned handler to return a completed child', async () => {
    mocks.currentUser = {
      id: 'handler-1',
      username: 'handler',
      real_name: '办理人',
      roles: [{ code: 'labor_contract_member' }],
    };
    mocks.getDispatchedOrder.mockResolvedValue({
      ...baseOrder,
      status: 'completed',
      handler_id: 'handler-1',
      completed_at: '2026-06-01T10:00:00Z',
      action_permissions: {},
    });

    renderDetail('/my-dispatched/d-1');

    expect(await screen.findByRole('button', { name: /退回已完成节点/ })).toBeInTheDocument();
  });

  it('does not allow an unrelated handler to return a completed child', async () => {
    mocks.currentUser = {
      id: 'handler-2',
      username: 'other-handler',
      real_name: '其他办理人',
      roles: [{ code: 'labor_contract_member' }],
    };
    mocks.getDispatchedOrder.mockResolvedValue({
      ...baseOrder,
      status: 'completed',
      handler_id: 'handler-1',
      completed_at: '2026-06-01T10:00:00Z',
      action_permissions: {},
    });

    renderDetail('/my-dispatched/d-1');

    await waitFor(() => expect(mocks.getDispatchedOrder).toHaveBeenCalledWith('d-1'));
    expect(screen.queryByRole('button', { name: /退回已完成节点/ })).not.toBeInTheDocument();
  });

  it('uses global accepted approval rule when backend returns accepted status alias', async () => {
    mocks.getDispatchedOrder.mockResolvedValue({
      ...baseOrder,
      module_code: 'resignation_social_insurance',
      module_name: '社保公积金减员',
      status: 'accepted',
      accepted_at: '2026-06-01T09:00:00Z',
    });

    renderDetail('/my-dispatched/d-1');

    expect(await screen.findByText('已接单')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /修改/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /撤回/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /作废/ })).toBeInTheDocument();
  });

  it('canonicalizes resignation_social_insurance alias to accessible list path on 返回列表', async () => {
    mocks.currentUser = {
      id: 'si-1',
      username: 'si',
      real_name: '社保专员',
      roles: [{ code: 'social_insurance_specialist' }],
    };
    mocks.getDispatchedOrder.mockResolvedValue({
      ...baseOrder,
      module_code: 'resignation_social_insurance',
      module_name: '社保公积金减员',
      status: 'processing',
    });

    renderDetail('/my-dispatched/d-1');

    fireEvent.click(await screen.findByRole('button', { name: '返回列表' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/onboarding/social_insurance_resign');
  });

  it('falls back to a role-accessible list instead of a 403 path on 返回列表 when role cannot access the module list', async () => {
    mocks.currentUser = {
      id: 'de-1',
      username: 'de',
      real_name: '报岗录入岗',
      roles: [{ code: 'data_entry_leader' }],
    };
    mocks.getDispatchedOrder.mockResolvedValue({
      ...baseOrder,
      module_code: 'social_insurance_resign',
      module_name: '社保公积金减员',
      status: 'processing',
    });

    renderDetail('/my-dispatched/d-1');

    fireEvent.click(await screen.findByRole('button', { name: '返回列表' }));
    const target = mocks.navigate.mock.calls.at(-1)?.[0];
    expect(target).not.toBe('/onboarding/social_insurance_resign');
    expect(target).not.toBe('/my-dispatched');
    expect(target).toBe('/dashboard');
  });

  it('shows and submits supplement action for maoyani on onboarding_contact with original conditions met', async () => {
    mocks.currentUser = {
      id: 'handler-maoyani',
      username: 'maoyani',
      real_name: '毛雅妮',
      roles: [{ code: 'onboarding_resignation_member' }],
    };
    mocks.supplementField.mockResolvedValue(undefined);
    mocks.getDispatchedOrder.mockResolvedValue({
      ...baseOrder,
      module_code: 'onboarding_contact',
      module_name: '入职联系',
      status: 'processing',
      handler_id: 'handler-maoyani',
      visible_fields: ['employee_name', 'bank_name'],
      supplementable_fields: ['bank_name'],
      extra_data: { employee_name: '张三', bank_name: '' },
    });

    renderDetail('/my-dispatched/d-1');

    const button = await screen.findByRole('button', { name: /补充\/修改暂存字段/ });
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    const okButton = await screen.findByRole('button', { name: 'OK' });
    fireEvent.click(okButton);

    await waitFor(() => expect(mocks.supplementField).toHaveBeenCalledWith('d-1', expect.objectContaining({ bank_name: '' })));
    await waitFor(() => expect(mocks.getDispatchedOrder).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.getSupplementLogs).toHaveBeenCalledTimes(2));
  });

  it('allows jianglu by real_name on onboarding_contact even when username differs', async () => {
    mocks.currentUser = {
      id: 'handler-jianglu',
      username: 'temp-user',
      real_name: '江璐',
      roles: [{ code: 'shared_team_owner' }],
    };
    mocks.getDispatchedOrder.mockResolvedValue({
      ...baseOrder,
      module_code: 'onboarding_contact',
      module_name: '入职联系',
      status: 'processing',
      handler_id: 'handler-jianglu',
      visible_fields: ['employee_name', 'bank_name'],
      supplementable_fields: ['bank_name'],
      extra_data: { employee_name: '张三', bank_name: '' },
    });

    renderDetail('/my-dispatched/d-1');

    expect(await screen.findByRole('button', { name: /补充\/修改暂存字段/ })).toBeInTheDocument();
  });

  it('hides supplement action for maoyani on contract child even when supplementable fields exist', async () => {
    mocks.currentUser = {
      id: 'handler-maoyani',
      username: 'maoyani',
      real_name: '毛雅妮',
      roles: [{ code: 'onboarding_resignation_member' }],
    };
    mocks.getDispatchedOrder.mockResolvedValue({
      ...baseOrder,
      module_code: 'contract',
      module_name: '劳动合同新签',
      status: 'processing',
      handler_id: 'handler-maoyani',
      visible_fields: ['employee_name', 'bank_name'],
      supplementable_fields: ['bank_name'],
      extra_data: { employee_name: '张三', bank_name: '' },
    });

    renderDetail('/my-dispatched/d-1');

    await waitFor(() => expect(mocks.getDispatchedOrder).toHaveBeenCalledWith('d-1'));
    expect(screen.queryByRole('button', { name: /补充\/修改暂存字段/ })).not.toBeInTheDocument();
    expect(screen.queryByText('补充字段（可编辑）')).not.toBeInTheDocument();
    expect(mocks.supplementField).not.toHaveBeenCalled();
  });

  it('hides supplement action and never calls supplement API for yangchun on onboarding_contact', async () => {
    mocks.currentUser = {
      id: 'handler-yangchun',
      username: 'yangchun',
      real_name: '杨纯',
      roles: [{ code: 'labor_contract_member' }],
    };
    mocks.getDispatchedOrder.mockResolvedValue({
      ...baseOrder,
      module_code: 'onboarding_contact',
      module_name: '入职联系',
      status: 'processing',
      handler_id: 'handler-yangchun',
      visible_fields: ['employee_name', 'bank_name'],
      supplementable_fields: ['bank_name'],
      extra_data: { employee_name: '张三', bank_name: '' },
    });

    renderDetail('/my-dispatched/d-1');

    await waitFor(() => expect(mocks.getDispatchedOrder).toHaveBeenCalledWith('d-1'));
    expect(screen.queryByRole('button', { name: /补充\/修改暂存字段/ })).not.toBeInTheDocument();
    expect(mocks.supplementField).not.toHaveBeenCalled();
  });
});
