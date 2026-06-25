import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import AdminImportTemplates from './index';

const getImportTemplateConfig = vi.fn();
const getAvailableImportTemplateFields = vi.fn();
const replaceImportTemplateConfig = vi.fn();
const downloadServerImportTemplate = vi.fn();
const messageSuccess = vi.fn();
const messageError = vi.fn();
const messageWarning = vi.fn();

vi.mock('@/services/importTemplates', () => ({
  getImportTemplateConfig: (...args: unknown[]) => getImportTemplateConfig(...args),
  getAvailableImportTemplateFields: (...args: unknown[]) => getAvailableImportTemplateFields(...args),
  replaceImportTemplateConfig: (...args: unknown[]) => replaceImportTemplateConfig(...args),
}));

vi.mock('@/services/workOrders', () => ({
  downloadServerImportTemplate: (...args: unknown[]) => downloadServerImportTemplate(...args),
}));

vi.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children, header }: { children: React.ReactNode; header?: { title?: string; extra?: React.ReactNode[] } }) => (
    <section>
      <h1>{header?.title}</h1>
      <div>{header?.extra}</div>
      {children}
    </section>
  ),
}));

vi.mock('antd', async () => {
  const ReactActual = await vi.importActual<typeof import('react')>('react');
  const passthrough = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  const Select = ({ value, options = [], onChange, placeholder }: any) => (
    <select
      aria-label={placeholder || 'select'}
      value={value ?? ''}
      onChange={(event) => onChange?.(event.currentTarget.value || undefined)}
    >
      <option value="">{placeholder || '请选择'}</option>
      {options.map((option: any) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
  const Button = ({ children, onClick, disabled }: any) => <button disabled={disabled} onClick={onClick}>{children}</button>;
  const Input = ({ value, onChange, placeholder }: any) => <input aria-label={placeholder} value={value ?? ''} placeholder={placeholder} onChange={onChange} />;
  const Table = ({ dataSource = [], columns = [] }: any) => (
    <table>
      <thead>
        <tr>{columns.map((col: any, index: number) => <th key={col.dataIndex || col.title || index}>{col.title}</th>)}</tr>
      </thead>
      <tbody>
        {dataSource.map((row: any, rowIndex: number) => (
          <tr key={row.field_code || rowIndex}>
            {columns.map((col: any, colIndex: number) => (
              <td key={col.dataIndex || col.title || colIndex}>
                {col.render ? col.render(row[col.dataIndex], row, rowIndex) : row[col.dataIndex]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
  const Typography = { Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span> };
  return {
    Alert: passthrough,
    App: { useApp: () => ({ message: { success: messageSuccess, error: messageError, warning: messageWarning } }) },
    Button,
    Card: ({ children, title, extra }: any) => <div><div>{title}{extra}</div>{children}</div>,
    Input,
    Popconfirm: ({ children, onConfirm }: any) => ReactActual.cloneElement(children, { onClick: onConfirm }),
    Select,
    Space: passthrough,
    Table,
    Tag: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
    Typography,
  };
});

const employeeField = {
  id: 'f1',
  order_type: 'onboarding',
  field_code: 'employee_name',
  field_name: '姓名',
  field_type: 'text',
  display_order: 1,
  header_alias: '员工姓名',
  is_required_override: null,
  is_required: true,
  default_required: true,
  conditional_required: null,
  dropdown_options: null,
  help_text: null,
  placeholder: null,
  is_active: true,
  source: 'configured',
};

const mobileField = {
  id: 'f2',
  order_type: 'onboarding',
  field_code: 'mobile',
  field_name: '移动电话',
  field_type: 'text',
  display_order: 2,
  header_alias: null,
  is_required_override: null,
  is_required: false,
  default_required: false,
  conditional_required: null,
  dropdown_options: null,
  help_text: null,
  placeholder: null,
  is_active: true,
  source: 'configured',
};

describe('AdminImportTemplates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getImportTemplateConfig.mockResolvedValue([employeeField]);
    getAvailableImportTemplateFields.mockResolvedValue([employeeField, mobileField]);
    replaceImportTemplateConfig.mockResolvedValue([{ ...employeeField, header_alias: '姓名表头' }]);
    downloadServerImportTemplate.mockResolvedValue({ fieldCount: 1, fileName: '工单管理系统-入职导入模板.xlsx' });
  });

  it('loads configured import template fields', async () => {
    render(<AdminImportTemplates />);

    await waitFor(() => expect(getImportTemplateConfig).toHaveBeenCalledWith('onboarding'));
    expect(screen.getByText('导入模板配置')).toBeInTheDocument();
    expect(screen.getByText('employee_name')).toBeInTheDocument();
    expect(screen.getByDisplayValue('员工姓名')).toBeInTheDocument();
  });

  it('saves edited header alias to import template config API', async () => {
    render(<AdminImportTemplates />);

    const input = await screen.findByDisplayValue('员工姓名');
    fireEvent.change(input, { target: { value: '姓名表头' } });
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() => expect(replaceImportTemplateConfig).toHaveBeenCalled());
    expect(replaceImportTemplateConfig).toHaveBeenCalledWith('onboarding', [
      expect.objectContaining({ fieldCode: 'employee_name', displayOrder: 1, headerAlias: '姓名表头', isRequiredOverride: null }),
    ]);
  });

  it('downloads current server import template', async () => {
    render(<AdminImportTemplates />);

    await waitFor(() => expect(getImportTemplateConfig).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: '下载当前模板' }));

    await waitFor(() => expect(downloadServerImportTemplate).toHaveBeenCalledWith('onboarding'));
    expect(messageSuccess).toHaveBeenCalled();
  });
});
