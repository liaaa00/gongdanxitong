import type { ProColumns, ProTableProps } from '@ant-design/pro-components';
import type { CachedListPageState, CachedTableFilters } from '@/utils/listPageState';

export type ViewMode = 'table' | 'kanban' | 'grid';

export interface ViewConfig {
  viewMode: ViewMode;
  columnsOrder: string[];
  columnsHidden: string[];
  columnWidths: Record<string, number>;
}

export interface SavedFilter {
  id: string;
  name: string;
  conditions: FilterCondition[];
}

export interface FilterCondition {
  field: string;
  op: 'eq' | 'ne' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte' | 'in';
  value: unknown;
}

export interface MultiViewTableProps<T extends Record<string, unknown>> {
  columns: ProColumns<T>[];
  request: (
    params: Record<string, unknown>,
    sort?: Record<string, unknown>,
    filters?: Record<string, unknown[] | null>,
  ) => Promise<{ data: T[]; success: boolean; total: number }>;
  rowKey?: string;
  viewId: string;
  kanbanColumnKey?: keyof T;
  kanbanAllowedValues?: Array<{ value: string; label: string; color?: string }>;
  onKanbanDragEnd?: (item: T, from: string, to: string) => Promise<void>;
  groupByOptions?: Array<{ key: keyof T; label: string }>;
  editableKeys?: (keyof T)[];
  onInlineEdit?: (id: string, patch: Partial<T>) => Promise<void>;
  toolBarRender?: () => React.ReactNode[];
  headerTitle?: string;
  batchActions?: (selectedRowKeys: React.Key[], clearSelection: () => void) => React.ReactNode;
  /** ProTable 内置搜索表单配置；false 表示关闭 */
  search?: ProTableProps<T, Record<string, unknown>>['search'];
  /** ProTable 分页配置，默认 20 条/页，可由页面覆盖 */
  pagination?: ProTableProps<T, Record<string, unknown>>['pagination'];
  /** 列表状态缓存 key；提供后会自动保存/恢复分页与表头筛选 */
  listStateKey?: string;
  /** 页面自行读取的初始列表状态；未传时按 listStateKey 从公共缓存读取 */
  initialListState?: CachedListPageState;
  /** MultiViewTable 写入状态后通知页面，便于页面同步派生 UI */
  onListStateChange?: (state: CachedListPageState) => void;
  /** 额外传入的受控表头筛选值；会和缓存筛选合并后恢复到列 filteredValue */
  controlledFilters?: CachedTableFilters;
  /** 关闭 ProTable 内置 options，避免默认工具栏 Tooltip 链路触发 findDOMNode */
  proTableOptions?: false;
  /** 关闭 ProTable 内置 toolBarRender，仅保留 MultiViewTable 自定义工具栏 */
  proTableToolBarRender?: false;
  /** 是否展示表格/看板/网格切换入口，默认不展示，按业务反馈固定表格呈现 */
  showViewSwitcher?: boolean;
  /** 是否展示常用筛选视图入口，默认不展示 */
  showFilterViews?: boolean;
  /** 是否展示列配置入口，默认不展示 */
  showColumnsConfig?: boolean;
}
