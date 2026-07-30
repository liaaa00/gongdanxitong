import { useRef, useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ProColumns, ActionType } from '@ant-design/pro-components';
import { ProTable } from '@ant-design/pro-components';
import { Button, Space, App } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import ViewSwitcher from './ViewSwitcher';
import ColumnsConfigDrawer from './ColumnsConfigDrawer';
import FilterViews from './FilterViews';
import KanbanView from './KanbanView';
import GridView from './GridView';
import {
  applyCachedColumnFilters,
  getCachedListPageState,
  normalizeCachedFilters,
  updateCachedListPageState,
  type CachedListPageState,
  type CachedTableFilters,
} from '@/utils/listPageState';
import type { ViewMode, MultiViewTableProps, ViewConfig, FilterCondition, SavedFilter } from './types';

const STORAGE_PREFIX = 'mv_config_';
const FILTER_STORAGE_PREFIX = 'mv_filters_';
void FILTER_STORAGE_PREFIX;

function loadViewConfig(viewId: string): ViewConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + viewId);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveViewConfig(viewId: string, config: ViewConfig) {
  localStorage.setItem(STORAGE_PREFIX + viewId, JSON.stringify(config));
}

function getInitialViewMode(viewId: string): ViewMode {
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get('view') as ViewMode | null;
  if (fromUrl && ['table', 'kanban', 'grid'].includes(fromUrl)) return fromUrl;
  const saved = loadViewConfig(viewId);
  return saved?.viewMode || 'table';
}

export function mergeTableFiltersIntoParams(
  params: Record<string, unknown>,
  tableFilters: Record<string, unknown[] | null | undefined> = {},
): Record<string, unknown> {
  const merged = { ...params };
  Object.entries(tableFilters).forEach(([key, value]) => {
    if (!Array.isArray(value)) return;
    const normalized = value
      .map((item) => String(item ?? '').trim())
      .filter(Boolean);
    if (normalized.length === 0) return;
    merged[key] = normalized.length === 1 ? normalized[0] : normalized;
  });
  return merged;
}

export function mergeTableSorterIntoParams(
  params: Record<string, unknown>,
  sorter: Record<string, unknown> = {},
): Record<string, unknown> {
  const merged = { ...params };
  const normalized = Object.entries(sorter)
    .map(([field, order]) => {
      if (order !== 'ascend' && order !== 'descend') return null;
      return `${field}:${order === 'ascend' ? 'asc' : 'desc'}`;
    })
    .filter((item): item is string => Boolean(item));
  if (normalized.length > 0) merged.sort = normalized.join(',');
  return merged;
}

function mergeCachedFilters(
  ...items: Array<CachedTableFilters | undefined>
): CachedTableFilters {
  return items.reduce<CachedTableFilters>((acc, item) => ({ ...acc, ...(item || {}) }), {});
}

function applyInitialPaginationState<T extends Record<string, unknown>>(
  pagination: MultiViewTableProps<T>['pagination'],
  state: CachedListPageState,
): MultiViewTableProps<T>['pagination'] {
  if (pagination === false) return false;
  const base = typeof pagination === 'object' ? pagination : {};
  return {
    ...base,
    defaultCurrent: state.current || base.defaultCurrent,
    defaultPageSize: state.pageSize || base.defaultPageSize,
  };
}

function mergeEffectiveTableFilters(
  tableFilters: Record<string, unknown[] | null | undefined> = {},
  cachedFilters?: CachedTableFilters,
  controlledFilters?: CachedTableFilters,
): Record<string, unknown[] | null> {
  return mergeCachedFilters(cachedFilters, controlledFilters, normalizeCachedFilters(tableFilters));
}

function normalizePageStateFromRequest(
  params: Record<string, unknown>,
  tableFilters: Record<string, unknown[] | null | undefined>,
  previousState: CachedListPageState,
): CachedListPageState {
  const current = Number((params as { current?: unknown }).current || params.page || previousState.current || 1);
  const pageSize = Number(params.pageSize || previousState.pageSize || 20);
  const next: CachedListPageState = {
    current: Number.isFinite(current) && current > 0 ? current : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 20,
    filters: normalizeCachedFilters(tableFilters),
  };
  return next;
}

function MultiViewTable<T extends Record<string, unknown>>(props: MultiViewTableProps<T>) {
  const {
    columns, request, rowKey = 'id', viewId,
    kanbanColumnKey, kanbanAllowedValues, onKanbanDragEnd,
    groupByOptions, editableKeys = [], onInlineEdit,
    toolBarRender, headerTitle, batchActions,
    search = false, pagination = { defaultPageSize: 20, showSizeChanger: true }, proTableOptions, proTableToolBarRender,
    listStateKey, initialListState, onListStateChange, controlledFilters,
    showViewSwitcher = false, showFilterViews = false, showColumnsConfig = false,
  } = props;
  void groupByOptions;
  void onKanbanDragEnd;

  const { message } = App.useApp();
  const actionRef = useRef<ActionType>(null);
  const [, setSearchParams] = useSearchParams();
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const clearSelection = useCallback(() => setSelectedRowKeys([]), []);
  const resolvedInitialListState = useMemo(
    () => initialListState || (listStateKey ? getCachedListPageState(listStateKey) : {}),
    [initialListState, listStateKey],
  );
  const currentListStateRef = useRef<CachedListPageState>(resolvedInitialListState);

  const savedConfig = useMemo(() => loadViewConfig(viewId), [viewId]);
  const allColKeys = useMemo(
    () => columns.filter((c) => c.dataIndex !== 'actions' && c.key !== 'actions')
      .map((c) => (c.dataIndex || c.key) as string),
    [columns],
  );

  const [viewMode, setViewMode] = useState<ViewMode>(() => (showViewSwitcher ? getInitialViewMode(viewId) : 'table'));
  const [hiddenKeys, setHiddenKeys] = useState<string[]>(() => savedConfig?.columnsHidden || []);
  const [colOrder, setColOrder] = useState<string[]>(() => savedConfig?.columnsOrder || allColKeys);
  const [columnsDrawerOpen, setColumnsDrawerOpen] = useState(false);
  const [dataSource, setDataSource] = useState<T[]>([]);
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>([]);

  const handleViewChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('view', mode);
      return next;
    });
    const existing = loadViewConfig(viewId) || { viewMode: mode, columnsOrder: allColKeys, columnsHidden: [], columnWidths: {} };
    saveViewConfig(viewId, { ...existing, viewMode: mode });
  }, [viewId, allColKeys, setSearchParams]);

  const handleFilterSelect = useCallback((filter: SavedFilter | null) => {
    if (filter) {
      setActiveFilterId(filter.id);
      setFilterConditions(filter.conditions);
    } else {
      setActiveFilterId(null);
      setFilterConditions([]);
    }
  }, []);

  const resolvedColumns = useMemo(() => {
    const activeColumns = columns.filter((c) => {
      const key = (c.dataIndex || c.key) as string;
      if (key === 'actions') return true;
      return !hiddenKeys.includes(key);
    });

    const sorted = [...activeColumns].sort((a, b) => {
      const ak = (a.dataIndex || a.key) as string;
      const bk = (b.dataIndex || b.key) as string;
      if (ak === 'actions') return 1;
      if (bk === 'actions') return -1;
      const ai = colOrder.indexOf(ak);
      const bi = colOrder.indexOf(bk);
      return (ai >= 0 ? ai : 999) - (bi >= 0 ? bi : 999);
    });

    const cachedFilters = mergeCachedFilters(resolvedInitialListState.filters, controlledFilters);
    const filtered = Object.keys(cachedFilters).length > 0
      ? applyCachedColumnFilters<T>(sorted as ProColumns<T>[], cachedFilters)
      : sorted;
    return filtered as ProColumns<T>[];
  }, [columns, hiddenKeys, colOrder, resolvedInitialListState.filters, controlledFilters]);

  const wrappedRequest = useCallback(async (
    params: Record<string, unknown>,
    sort: Record<string, unknown>,
    tableFilters: Record<string, unknown[] | null> = {},
  ) => {
    const effectiveTableFilters = mergeEffectiveTableFilters(
      tableFilters,
      currentListStateRef.current.filters,
      controlledFilters,
    );
    if (listStateKey) {
      const nextState = updateCachedListPageState(
        listStateKey,
        normalizePageStateFromRequest(params, effectiveTableFilters, currentListStateRef.current),
      );
      currentListStateRef.current = nextState;
      onListStateChange?.(nextState);
    }
    const merged = mergeTableSorterIntoParams(
      mergeTableFiltersIntoParams(params, effectiveTableFilters),
      sort,
    );
    if (filterConditions.length > 0) {
      merged._filters = JSON.stringify(filterConditions);
    }
    const result = await request(merged, sort, effectiveTableFilters);
    setDataSource(result.data || []);
    return result;
  }, [request, filterConditions, listStateKey, onListStateChange, controlledFilters]);

  const kanbanValues = useMemo(() => {
    if (!kanbanAllowedValues) {
      const uniqueValues = new Set<string>();
      dataSource.forEach((item) => {
        const val = item[kanbanColumnKey as string];
        if (val !== undefined && val !== null) uniqueValues.add(String(val));
      });
      return Array.from(uniqueValues).map((v) => ({ value: v, label: v }));
    }
    return kanbanAllowedValues;
  }, [dataSource, kanbanColumnKey, kanbanAllowedValues]);

  const resolvedPagination = useMemo(
    () => applyInitialPaginationState<T>(pagination, resolvedInitialListState),
    [pagination, resolvedInitialListState],
  );

  const viewConfig: ViewConfig = { viewMode, columnsOrder: colOrder, columnsHidden: hiddenKeys, columnWidths: {} };

  return (
    <div>
      <Space style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        {showViewSwitcher && <ViewSwitcher value={viewMode} onChange={handleViewChange} />}
        {showFilterViews && (
          <FilterViews
            viewId={viewId}
            columns={columns as ProColumns<Record<string, unknown>>[]}
            activeFilterId={activeFilterId}
            onFilterSelect={handleFilterSelect}
            currentConditions={filterConditions}
            onConditionsChange={setFilterConditions}
          />
        )}
        {showColumnsConfig && (
          <Button size="small" icon={<SettingOutlined />}
            onClick={() => setColumnsDrawerOpen(true)}>
            列配置
          </Button>
        )}
        {toolBarRender && (
          <Space size={8}>
            {toolBarRender()}
          </Space>
        )}
      </Space>

      {viewMode === 'table' && (
        <ProTable<T>
          getPopupContainer={() => document.body}
          actionRef={actionRef}
          columns={resolvedColumns}
          request={wrappedRequest}
          rowKey={rowKey}
          search={search}
          headerTitle={headerTitle}
          pagination={resolvedPagination}
          scroll={{ x: 1280 }}
          dateFormatter="string"
          options={proTableOptions === false ? false : { reload: () => actionRef.current?.reload() }}
          toolBarRender={proTableToolBarRender === false ? false : undefined}
          rowSelection={batchActions ? {
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys),
            preserveSelectedRowKeys: true,
          } : undefined}
          tableAlertOptionRender={batchActions
            ? () => batchActions(selectedRowKeys, clearSelection)
            : undefined}
        />
      )}

      {viewMode === 'kanban' && kanbanColumnKey && (
        <KanbanView<T>
          dataSource={dataSource}
          rowKey={rowKey}
          columnKey={String(kanbanColumnKey)}
          allowedValues={kanbanValues}
          renderItem={(item) => (
            <div style={{ fontSize: 12 }}>
              {resolvedColumns.slice(0, 3).map((col) => {
                const val = item[(col.dataIndex || col.key) as string];
                return (
                  <div key={String(col.dataIndex || col.key)} style={{ marginBottom: 2 }}>
                    <span style={{ color: '#999' }}>{col.title as string}: </span>
                    <span>{String(val ?? '—')}</span>
                  </div>
                );
              })}
            </div>
          )}
        />
      )}

      {viewMode === 'grid' && (
        <GridView<T>
          dataSource={dataSource}
          rowKey={rowKey}
          columns={resolvedColumns}
          editableKeys={editableKeys as string[]}
          onInlineEdit={onInlineEdit as ((id: string, patch: Partial<T>) => Promise<void>) | undefined}
        />
      )}

      {showColumnsConfig && (
        <ColumnsConfigDrawer
          open={columnsDrawerOpen}
          onClose={() => {
            setColumnsDrawerOpen(false);
            message.info('列配置已更新');
          }}
          viewId={viewId}
          columns={columns as ProColumns<Record<string, unknown>>[]}
          hiddenKeys={hiddenKeys}
          onHiddenKeysChange={setHiddenKeys}
          order={colOrder}
          onOrderChange={setColOrder}
        />
      )}
    </div>
  );
}

export default MultiViewTable;
export type { MultiViewTableProps, ViewMode, ViewConfig, SavedFilter, FilterCondition };
