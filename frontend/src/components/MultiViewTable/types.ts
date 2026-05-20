import type { ProColumns } from '@ant-design/pro-components';

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
  request: (params: Record<string, unknown>) => Promise<{ data: T[]; success: boolean; total: number }>;
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
  /** 关闭 ProTable 内置 options，避免默认工具栏 Tooltip 链路触发 findDOMNode */
  proTableOptions?: false;
  /** 关闭 ProTable 内置 toolBarRender，仅保留 MultiViewTable 自定义工具栏 */
  proTableToolBarRender?: false;
}
