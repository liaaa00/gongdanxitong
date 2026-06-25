import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MyDispatchedDetail from './index';

const mocks = vi.hoisted(() => ({
  getDispatchedOrder: vi.fn(),
  confirmDispatchedDirtyRead: vi.fn(),
  getFields: vi.fn(),
  getFallbackFields: vi.fn(),
  getSupplementLogs: vi.fn(),
  getActiveDetailViewTemplate: vi.fn(),
  getExportTemplates: vi.fn(),
  supplementField: vi.fn(),
  navigate: vi.fn(),
  confirm: vi.fn(),
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
  useFieldPermissions: () => ({ permissions: { employee_name: 'visible' } }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mocks.currentUser,
    hasRole: (role: string) => mocks.currentUser.roles.some((item: { code: string }) => item.code === role),
  }),
}));

vi.mock('@/services/dispatchedOrders', () => ({
  getDispatchedOrder: (...args: unknown[]) => mocks.getDispatchedOrder(...args),
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
  resubmitDispatchedOrder: vi.fn(),
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

vi.mock('@/services/exportTemplates', () => ({
  getExportTemplates: (...args: unknown[]) => mocks.getExportTemplates(...args),
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
        message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
        notification: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
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
    mocks.getFields.mockResolvedValue(fields);
    mocks.getFallbackFields.mockReturnValue(fields);
    mocks.getSupplementLogs.mockResolvedValue([]);
    mocks.getActiveDetailViewTemplate.mockResolvedValue(null);
    mocks.getExportTemplates.mockResolvedValue([]);
    mocks.getDispatchedOrder.mockResolvedValue(baseOrder);
  });

  it('uses Suchuang/E签宝 export template field union for contract detail', async () => {
    mocks.getExportTemplates.mockResolvedValue([
      {
        id: 'tpl-sc',
        template_name: '劳动合同导出模板-速创',
        module_code: 'contract',
        sign_platform: '速创',
        field_list: [
          { field_code: 'bank_name', alias: '开户银行' },
          { field_code: 'company_address', alias: '甲方住所' },
          { field_code: 'contract_subject', alias: '甲方名称（限43字）-签署方1' },
        ],
      },
      {
        id: 'tpl-esign',
        template_name: '劳动合同导出模板-E签宝',
        module_code: 'contract',
        sign_platform: 'E签宝',
        field_list: [
          { field_code: 'project_name', alias: '项目名称' },
          { field_code: 'custom_template_only', alias: '模板专用字段' },
          { field_code: 'contract_template', alias: '劳动合同模板' },
        ],
      },
    ]);
    mocks.getDispatchedOrder.mockResolvedValue({
      ...baseOrder,
      module_code: 'contract',
      visible_fields: ['employee_name'],
      extra_data: {
        employee_name: '张三',
        bank_name: '速创银行',
        custom_template_only: 'E签宝配置值',
        company_address: '甲方地址',
        project_name: '项目A',
        contract_subject: '合同主体公司',
        contract_template: '标准模板',
        gender: '男',
        birth_date: '1990-01-01',
        age: 36,
        probation_end_date: '2026-08-31',
      },
    });

    renderDetail('/my-dispatched/d-1');

    await waitFor(() => {
      expect(mocks.getExportTemplates).toHaveBeenCalledWith('contract');
      expect(mocks.getActiveDetailViewTemplate).not.toHaveBeenCalledWith('contract');
      expect(document.body).not.toHaveTextContent('员工姓名');
      expect(document.body).toHaveTextContent('甲方住所');
      expect(document.body).toHaveTextContent('甲方地址');
      expect(document.body).toHaveTextContent('项目名称');
      expect(document.body).toHaveTextContent('项目A');
      expect(document.body).toHaveTextContent('开户银行');
      expect(document.body).toHaveTextContent('速创银行');
      expect(document.body).toHaveTextContent('模板专用字段');
      expect(document.body).toHaveTextContent('E签宝配置值');
      expect(document.body).toHaveTextContent('劳动合同主体');
      expect(document.body).not.toHaveTextContent('甲方名称（限43字）-签署方1');
      expect(document.body).toHaveTextContent('合同主体公司');
      expect(document.body).toHaveTextContent('劳动合同模板（标准模板/特殊模板）');
      expect(document.body).toHaveTextContent('标准模板');
      expect(document.body).toHaveTextContent('性别');
      expect(document.body).toHaveTextContent('男');
      expect(document.body).toHaveTextContent('出生日期');
      expect(document.body).toHaveTextContent('1990-01-01');
      expect(document.body).toHaveTextContent('年龄');
      expect(document.body).toHaveTextContent('36');
      expect(document.body).toHaveTextContent('试用期结束日期');
      expect(document.body).toHaveTextContent('2026-08-31');
    });
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
