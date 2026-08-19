import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DynamicForm from './index';
import type { FieldConfig, ConditionalRequired } from './index';

const { mockGetContractSubjects } = vi.hoisted(() => ({
  mockGetContractSubjects: vi.fn(),
}));

vi.mock('@/services/contractSubjects', () => ({
  getAllowedFundRatios: () => [],
  getContractSubjects: mockGetContractSubjects,
}));

const mockFields: FieldConfig[] = [
  { field_code: 'name', field_name: '姓名', field_type: 'text', is_required: true, default_required: true, display_order: 1 },
  { field_code: 'age', field_name: '年龄', field_type: 'number', is_required: false, default_required: false, display_order: 2 },
  { field_code: 'birth', field_name: '生日', field_type: 'date', is_required: false, default_required: false, display_order: 3 },
  { field_code: 'gender', field_name: '性别', field_type: 'dropdown', is_required: true, default_required: true, dropdown_options: [{ label: '男', value: '男' }, { label: '女', value: '女' }], display_order: 4 },
  { field_code: 'note', field_name: '备注', field_type: 'textarea', is_required: false, default_required: false, display_order: 5 },
];

describe('DynamicForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all 5 field types', async () => {
    render(<DynamicForm fields={mockFields} />);
    await waitFor(() => {
      expect(screen.getByText('姓名')).toBeInTheDocument();
      expect(screen.getByText('年龄')).toBeInTheDocument();
      expect(screen.getByText('生日')).toBeInTheDocument();
      expect(screen.getByText('性别')).toBeInTheDocument();
      expect(screen.getByText('备注')).toBeInTheDocument();
    });
  });

  it('hides fields with hidden permission and keeps readonly visible', async () => {
    const permissions = { name: 'readonly' as const, age: 'hidden' as const };
    render(<DynamicForm fields={mockFields} fieldPermissions={permissions} />);
    await waitFor(() => {
      expect(screen.getByText('姓名')).toBeInTheDocument();
    });
    expect(screen.queryByText('年龄')).not.toBeInTheDocument();
  });

  it('renders form with conditional required fields present', async () => {
    const cond: ConditionalRequired[] = [
      { field: 'gender', value: '女', requireFields: ['note'] },
    ];
    render(<DynamicForm fields={mockFields} conditionalRequired={cond} />);
    await waitFor(() => {
      expect(screen.getByText('性别')).toBeInTheDocument();
      expect(screen.getByText('备注')).toBeInTheDocument();
    });
  });

  it('requires a dependent field when an exists condition is met', async () => {
    const onFinish = vi.fn().mockResolvedValue(undefined);
    const cond: ConditionalRequired[] = [
      { field: 'name', operator: 'exists', requireFields: ['note'] },
    ];
    render(
      <DynamicForm
        fields={mockFields.filter((field) => ['name', 'note'].includes(field.field_code))}
        conditionalRequired={cond}
        onFinish={onFinish}
        submitText="提交"
      />,
    );

    await userEvent.type(screen.getByLabelText('姓名'), '张三');
    await userEvent.click(screen.getByRole('button', { name: /提\s*交/ }));

    expect(await screen.findByText('当「姓名」有值时此项为必填')).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('requires a dependent field only when all conditional values match', async () => {
    const onFinish = vi.fn().mockResolvedValue(undefined);
    const cond: ConditionalRequired[] = [{
      conditions: [
        { field: 'name', value: '张三' },
        { field: 'age', value: '30' },
      ],
      requireFields: ['note'],
    }];
    render(
      <DynamicForm
        fields={mockFields.filter((field) => ['name', 'age', 'note'].includes(field.field_code))}
        initialValues={{ name: '张三', age: '30', note: '' }}
        conditionalRequired={cond}
        onFinish={onFinish}
        submitText="提交"
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /提\s*交/ }));
    expect(await screen.findByText('当「姓名」为张三且「年龄」为30时此项为必填')).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('does not require a dependent field when one conditional value does not match', async () => {
    const onFinish = vi.fn().mockResolvedValue(undefined);
    const cond: ConditionalRequired[] = [{
      conditions: [
        { field: 'name', value: '张三' },
        { field: 'age', value: '30' },
      ],
      requireFields: ['note'],
    }];
    render(
      <DynamicForm
        fields={mockFields.filter((field) => ['name', 'age', 'note'].includes(field.field_code))}
        initialValues={{ name: '张三', age: '31', note: '' }}
        conditionalRequired={cond}
        onFinish={onFinish}
        submitText="提交"
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /提\s*交/ }));
    await waitFor(() => expect(onFinish).toHaveBeenCalled());
  });

  it('blocks onFinish when a required field is empty', async () => {
    const onFinish = vi.fn().mockResolvedValue(undefined);
    render(<DynamicForm fields={mockFields} onFinish={onFinish} submitText="提交" />);
    await waitFor(() => expect(screen.getByText('姓名')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /提\s*交/ }));
    expect(await screen.findByText('姓名为必填')).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('submits a changed optional field without validating untouched historical required gaps', async () => {
    const onFinish = vi.fn().mockResolvedValue(undefined);
    render(
      <DynamicForm
        fields={mockFields.filter((field) => ['name', 'note'].includes(field.field_code))}
        initialValues={{ name: '', note: '' }}
        onFinish={onFinish}
        submitText="保存字段"
        validateChangedFieldsOnly
      />,
    );

    await userEvent.type(screen.getByLabelText('备注'), '本次补录');
    await userEvent.click(screen.getByRole('button', { name: /保\s*存\s*字\s*段/ }));

    await waitFor(() => expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ note: '本次补录' })));
  });

  it('still blocks clearing a required field in changed-fields-only mode', async () => {
    const onFinish = vi.fn().mockResolvedValue(undefined);
    render(
      <DynamicForm
        fields={mockFields.filter((field) => ['name', 'note'].includes(field.field_code))}
        initialValues={{ name: '张三', note: '' }}
        onFinish={onFinish}
        submitText="保存字段"
        validateChangedFieldsOnly
      />,
    );

    await userEvent.clear(screen.getByLabelText('姓名'));
    await userEvent.click(screen.getByRole('button', { name: /保\s*存\s*字\s*段/ }));

    expect(await screen.findByText('姓名为必填')).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('shows city as metadata and keeps the exact subject value', async () => {
    const onValuesChange = vi.fn();
    const subjectName = '外服(浙江)企业服务有限公司吉林分公司';
    mockGetContractSubjects.mockResolvedValue([{
      id: 'subject-jilin',
      subjectName,
      socialCreditCode: null,
      province: '吉林',
      city: '吉林',
      registeredAddress: '吉林市丰满区松江南路1123号',
      fundRatioOptions: [],
      supplementaryFundRatioOptions: [],
      fundRatioMode: 'same',
      isActive: true,
    }]);
    render(
      <DynamicForm
        fields={[{
          field_code: 'contract_subject',
          field_name: '劳动合同主体',
          field_type: 'text',
          is_required: false,
          default_required: false,
          display_order: 1,
        }]}
        onValuesChange={onValuesChange}
      />,
    );

    const select = await screen.findByRole('combobox', { name: '劳动合同主体' });
    await userEvent.click(select);
    const option = await screen.findByText(`${subjectName}｜城市：吉林`);
    await userEvent.click(option);

    await waitFor(() => expect(onValuesChange).toHaveBeenCalledWith(
      expect.objectContaining({ contract_subject: subjectName }),
      expect.anything(),
    ));
  });

  it('marks highlighted fields with stable focus anchor', async () => {
    render(<DynamicForm fields={mockFields} highlightedFields={['name']} focusField="name" />);
    await waitFor(() => expect(screen.getByText('姓名')).toBeInTheDocument());
    const highlighted = document.getElementById('dynamic-field-name');
    expect(highlighted).toBeTruthy();
    expect(highlighted).toHaveStyle({ background: '#fffbe6' });
  });
});
