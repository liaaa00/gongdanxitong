import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MultiViewTable, { mergeTableFiltersIntoParams, mergeTableSorterIntoParams } from './index';

const mockColumns = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Age', dataIndex: 'age', key: 'age' },
  { title: 'Status', dataIndex: 'status', key: 'status' },
];

const mockRequest = vi.fn().mockResolvedValue({
  data: [
    { id: '1', name: 'Alice', age: 30, status: 'active' },
    { id: '2', name: 'Bob', age: 25, status: 'inactive' },
  ],
  success: true,
  total: 2,
});

describe('MultiViewTable', () => {
  it('keeps all table filter values when merging request params', () => {
    expect(mergeTableFiltersIntoParams(
      { page: 1 },
      { status: ['pending', 'processing'], type: ['onboarding'] },
    )).toEqual({ page: 1, status: ['pending', 'processing'], type: 'onboarding' });
  });

  it('drops cleared table filters and keeps single-value compatibility', () => {
    expect(mergeTableFiltersIntoParams(
      { page: 1, keyword: 'alice' },
      { status: [], owner: null, priority: [' urgent '] },
    )).toEqual({ page: 1, keyword: 'alice', priority: 'urgent' });
  });

  it('serializes ProTable sorter into backend sort params', () => {
    expect(mergeTableSorterIntoParams(
      { page: 1 },
      { created_at: 'descend', name: undefined, updated_at: 'ascend' },
    )).toEqual({ page: 1, sort: 'created_at:desc,updated_at:asc' });
  });

  it('renders table view by default', async () => {
    render(
      <MemoryRouter>
        <MultiViewTable
          columns={mockColumns}
          request={mockRequest}
          rowKey="id"
          viewId="test-table"
          headerTitle="Test Table"
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Test Table')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('renders view switcher with three options when enabled', async () => {
    render(
      <MemoryRouter>
        <MultiViewTable
          columns={mockColumns}
          request={mockRequest}
          rowKey="id"
          viewId="test-view-switcher"
          showViewSwitcher
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('表格')).toBeTruthy();
      expect(screen.getByText('看板')).toBeTruthy();
      expect(screen.getByText('网格')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('renders column config button when enabled', async () => {
    render(
      <MemoryRouter>
        <MultiViewTable
          columns={mockColumns}
          request={mockRequest}
          rowKey="id"
          viewId="test-col-config"
          showColumnsConfig
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('列配置')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('handles request loading', async () => {
    const request = vi.fn().mockResolvedValue({ data: [], success: true, total: 0 });
    const { container } = render(
      <MemoryRouter>
        <MultiViewTable
          columns={mockColumns}
          request={request}
          rowKey="id"
          viewId="test-loading"
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      const errorDiv = container.querySelector('.ant-result-error');
      expect(errorDiv).toBeNull();
    }, { timeout: 5000 });
  });

  it('handles kanban view props', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/?view=kanban']}>
        <MultiViewTable
          columns={mockColumns}
          request={mockRequest}
          rowKey="id"
          viewId="test-kanban"
          kanbanColumnKey="status"
          kanbanAllowedValues={[
            { value: 'active', label: 'Active', color: 'green' },
            { value: 'inactive', label: 'Inactive', color: 'red' },
          ]}
          showViewSwitcher
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(container.textContent).toBeTruthy();
    }, { timeout: 5000 });
  });
});
