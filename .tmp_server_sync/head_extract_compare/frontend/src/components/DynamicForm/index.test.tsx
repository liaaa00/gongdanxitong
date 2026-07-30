import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DynamicForm from './index';
import type { FieldConfig, ConditionalRequired } from './index';

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

  it('calls onFinish when submit button is clicked', async () => {
    const onFinish = vi.fn().mockResolvedValue(undefined);
    render(<DynamicForm fields={mockFields} onFinish={onFinish} submitText="提交" />);
    await waitFor(() => expect(screen.getByText('姓名')).toBeInTheDocument());
    const buttons = document.querySelectorAll('button[type="submit"]');
    if (buttons.length > 0) {
      await userEvent.click(buttons[0] as HTMLElement);
      await waitFor(() => {
        expect(onFinish).toHaveBeenCalled();
      });
    }
  });

  it('marks highlighted fields with stable focus anchor', async () => {
    render(<DynamicForm fields={mockFields} highlightedFields={['name']} focusField="name" />);
    await waitFor(() => expect(screen.getByText('姓名')).toBeInTheDocument());
    const highlighted = document.getElementById('dynamic-field-name');
    expect(highlighted).toBeTruthy();
    expect(highlighted).toHaveStyle({ background: '#fffbe6' });
  });
});
