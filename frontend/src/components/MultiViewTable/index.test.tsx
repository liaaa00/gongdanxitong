import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import MultiViewTable, { mergeTableFiltersIntoParams, mergeTableSorterIntoParams } from './index';
import { clearCachedListPageState } from '@/utils/listPageState';

const mockColumns = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Age', dataIndex: 'age', key: 'age' },
  { title: 'Status', dataIndex: 'status', key: 'status', filters: true },
];

const mockRequest = vi.fn().mockResolvedValue({
  data: [
    { id: '1', name: 'Alice', age: 30, status: 'active' },
    { id: '2', name: 'Bob', age: 25, status: 'inactive' },
  ],
  success: true,
  total: 2,
});

function renderTable(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      {ui}
    </MemoryRouter>,
  );
}

function installSessionStorage(initialStore: Record<string, string> = {}) {
  const store = { ...initialStore };
  const ss = {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((idx: number) => Object.keys(store)[idx] ?? null),
    clear: vi.fn(() => { Object.keys(store).forEach((k) => delete store[k]); }),
  } as unknown as Storage;
  Object.defineProperty(window, 'sessionStorage', {
    value: ss,
    writable: true,
    configurable: true,
  });
  return { ss, store };
}

describe('MultiViewTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCachedListPageState();
    // mock App.useApp to avoid "must be used within App component" error
    vi.spyOn(App, 'useApp').mockReturnValue({
      message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), loading: vi.fn(), open: vi.fn(), destroy: vi.fn() } as any,
      notification: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), open: vi.fn(), destroy: vi.fn() } as any,
      modal: { confirm: vi.fn() } as any,
    });
    mockRequest.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearCachedListPageState();
  });

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

  it('skips invalid sorter directions', () => {
    expect(mergeTableSorterIntoParams(
      { page: 1 },
      { created_at: 'invalid' as unknown as string, name: null as unknown as string },
    )).toEqual({ page: 1 });
  });

  it('renders table view by default', async () => {
    renderTable(
      <MultiViewTable
        columns={mockColumns}
        request={mockRequest}
        rowKey="id"
        viewId="test-table"
        headerTitle="Test Table"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Test Table')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('renders view switcher with three options when enabled', async () => {
    renderTable(
      <MultiViewTable
        columns={mockColumns}
        request={mockRequest}
        rowKey="id"
        viewId="test-view-switcher"
        showViewSwitcher
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('表格')).toBeTruthy();
      expect(screen.getByText('看板')).toBeTruthy();
      expect(screen.getByText('网格')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('renders column config button when enabled', async () => {
    renderTable(
      <MultiViewTable
        columns={mockColumns}
        request={mockRequest}
        rowKey="id"
        viewId="test-col-config"
        showColumnsConfig
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('列配置')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('handles request loading', async () => {
    const request = vi.fn().mockResolvedValue({ data: [], success: true, total: 0 });
    const { container } = renderTable(
      <MultiViewTable
        columns={mockColumns}
        request={request}
        rowKey="id"
        viewId="test-loading"
      />,
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

// ─── 列表状态保存/恢复测试 ────────────────────────────────────────────

describe('MultiViewTable list state persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCachedListPageState();
    vi.spyOn(App, 'useApp').mockReturnValue({
      message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), loading: vi.fn(), open: vi.fn(), destroy: vi.fn() } as any,
      notification: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), open: vi.fn(), destroy: vi.fn() } as any,
      modal: { confirm: vi.fn() } as any,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearCachedListPageState();
  });

  it('renders without crash when listStateKey is provided', async () => {
    renderTable(
      <MultiViewTable
        columns={mockColumns}
        request={mockRequest}
        rowKey="id"
        viewId="test-list-state"
        listStateKey="my-work:initiated"
        headerTitle="List State Test"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('List State Test')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('renders without crash when initialListState is provided', async () => {
    renderTable(
      <MultiViewTable
        columns={mockColumns}
        request={mockRequest}
        rowKey="id"
        viewId="test-init-state"
        initialListState={{ current: 3, pageSize: 50, month: '2026-05' }}
        listStateKey="my-work:initiated"
        headerTitle="Initial State Test"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Initial State Test')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('renders without crash with onListStateChange callback', async () => {
    const handleChange = vi.fn();
    renderTable(
      <MultiViewTable
        columns={mockColumns}
        request={mockRequest}
        rowKey="id"
        viewId="test-on-change"
        listStateKey="on-change-key"
        onListStateChange={handleChange}
        headerTitle="OnChange Test"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('OnChange Test')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('renders without crash with controlledFilters', async () => {
    renderTable(
      <MultiViewTable
        columns={mockColumns}
        request={mockRequest}
        rowKey="id"
        viewId="test-controlled"
        listStateKey="controlled-key"
        controlledFilters={{ status: ['active'] }}
        headerTitle="Controlled Filters"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Controlled Filters')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('writes list state to sessionStorage when listStateKey is set and request fires', async () => {
    const { ss } = installSessionStorage();

    const requestFn = vi.fn().mockResolvedValue({ data: [], success: true, total: 0 });

    renderTable(
      <MultiViewTable
        columns={mockColumns}
        request={requestFn}
        rowKey="id"
        viewId="test-save-ss"
        listStateKey="persist:test"
        headerTitle="SS Save Test"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('SS Save Test')).toBeTruthy();
    }, { timeout: 5000 });

    await waitFor(() => {
      const setItemCalls = ss.setItem.mock.calls.filter(
        (call: [string, string]) => String(call[0]).startsWith('list_page_state:'),
      );
      expect(setItemCalls.length).toBeGreaterThan(0);
    }, { timeout: 5000 });
  });

  it('reads cached list state from sessionStorage for listStateKey', async () => {
    const { ss } = installSessionStorage({
      'list_page_state:restore:test': JSON.stringify({ current: 7, pageSize: 100 }),
    });

    const requestFn = vi.fn().mockResolvedValue({ data: [], success: true, total: 0 });

    renderTable(
      <MultiViewTable
        columns={mockColumns}
        request={requestFn}
        rowKey="id"
        viewId="test-restore-ss"
        listStateKey="restore:test"
        headerTitle="SS Restore Test"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('SS Restore Test')).toBeTruthy();
    }, { timeout: 5000 });

    const getItemCalls = ss.getItem.mock.calls.filter(
      (call: [string]) => call[0] === 'list_page_state:restore:test',
    );
    expect(getItemCalls.length).toBeGreaterThan(0);
  });

  it('uses initialListState prop over sessionStorage cache', async () => {
    installSessionStorage({
      'list_page_state:override:test': JSON.stringify({ current: 1, pageSize: 20 }),
    });

    const requestFn = vi.fn().mockResolvedValue({ data: [], success: true, total: 0 });

    renderTable(
      <MultiViewTable
        columns={mockColumns}
        request={requestFn}
        rowKey="id"
        viewId="test-override-ss"
        listStateKey="override:test"
        initialListState={{ current: 10, pageSize: 200, month: '2026-06' }}
        headerTitle="Override Test"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Override Test')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('isolates list state between different listStateKeys', async () => {
    const { ss } = installSessionStorage({
      'list_page_state:isolate:a': JSON.stringify({ current: 3, filters: { status: ['active'] } }),
      'list_page_state:isolate:b': JSON.stringify({ current: 8, filters: { status: ['inactive'] } }),
    });

    const requestA = vi.fn().mockResolvedValue({ data: [], success: true, total: 0 });
    const { unmount } = renderTable(
      <MultiViewTable
        columns={mockColumns}
        request={requestA}
        rowKey="id"
        viewId="test-isolate-a"
        listStateKey="isolate:a"
        headerTitle="Isolate A"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Isolate A')).toBeTruthy();
    }, { timeout: 5000 });

    await act(async () => {
      unmount();
    });

    const requestB = vi.fn().mockResolvedValue({ data: [], success: true, total: 0 });
    renderTable(
      <MultiViewTable
        columns={mockColumns}
        request={requestB}
        rowKey="id"
        viewId="test-isolate-b"
        listStateKey="isolate:b"
        headerTitle="Isolate B"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Isolate B')).toBeTruthy();
    }, { timeout: 5000 });

    const getItemCallsA = ss.getItem.mock.calls.filter((c: [string]) => c[0] === 'list_page_state:isolate:a');
    const getItemCallsB = ss.getItem.mock.calls.filter((c: [string]) => c[0] === 'list_page_state:isolate:b');
    expect(getItemCallsA.length).toBeGreaterThan(0);
    expect(getItemCallsB.length).toBeGreaterThan(0);
  });
});
