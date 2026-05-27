import React, { useCallback, useMemo, useState } from 'react';
import type { ProColumns } from '@ant-design/pro-components';

type ColumnLike = {
  key?: React.Key;
  dataIndex?: React.Key | React.Key[];
  width?: number | string;
  onHeaderCell?: (column: unknown) => Record<string, unknown>;
};

interface UseResizableProColumnsOptions {
  storageKey?: string;
  minWidth?: number;
  defaultWidth?: number;
  extraScrollWidth?: number;
}

function getColumnKey(column: ColumnLike, index: number): string {
  if (column.key !== undefined && column.key !== null) return String(column.key);
  if (Array.isArray(column.dataIndex)) return column.dataIndex.join('.');
  if (column.dataIndex !== undefined && column.dataIndex !== null) return String(column.dataIndex);
  return `column-${index}`;
}

function readWidth(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function loadWidths(storageKey?: string): Record<string, number> {
  if (!storageKey || typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(`resizable_columns_${storageKey}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveWidths(storageKey: string | undefined, widths: Record<string, number>) {
  if (!storageKey || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`resizable_columns_${storageKey}`, JSON.stringify(widths));
  } catch {
    // ignore storage quota / private mode errors
  }
}

export function useResizableProColumns<T = Record<string, unknown>>(
  columns: ProColumns<T>[],
  options: UseResizableProColumnsOptions = {},
) {
  const minWidth = options.minWidth ?? 96;
  const defaultWidth = options.defaultWidth ?? 140;
  const extraScrollWidth = options.extraScrollWidth ?? 80;
  const [widths, setWidths] = useState<Record<string, number>>(() => loadWidths(options.storageKey));

  const startResize = useCallback((key: string, startX: number, startWidth: number) => {
    const initialWidth = Math.max(startWidth || defaultWidth, minWidth);

    const onMouseMove = (event: MouseEvent) => {
      const nextWidth = Math.max(minWidth, Math.round(initialWidth + event.clientX - startX));
      setWidths((previous) => {
        const next = { ...previous, [key]: nextWidth };
        saveWidths(options.storageKey, next);
        return next;
      });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [defaultWidth, minWidth, options.storageKey]);

  const HeaderCell = useMemo(() => {
    const ResizableHeaderCell: React.FC<React.ThHTMLAttributes<HTMLTableCellElement> & { 'data-column-key'?: string }> = (props) => {
      const { children, style, ...restProps } = props;
      const key = props['data-column-key'];
      const currentWidth = key ? readWidth(widths[key]) ?? readWidth(style?.width) ?? defaultWidth : readWidth(style?.width);
      return (
        <th
          {...restProps}
          style={{
            ...style,
            width: currentWidth,
            minWidth: currentWidth,
            textAlign: 'center',
            whiteSpace: 'nowrap',
            position: 'relative',
          }}
        >
          {children}
          {key && (
            <span
              aria-hidden
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                startResize(key, event.clientX, currentWidth || defaultWidth);
              }}
              style={{
                position: 'absolute',
                top: 0,
                right: -3,
                width: 8,
                height: '100%',
                cursor: 'col-resize',
                userSelect: 'none',
                zIndex: 2,
              }}
            />
          )}
        </th>
      );
    };
    return ResizableHeaderCell;
  }, [defaultWidth, startResize, widths]);

  const resizableColumns = useMemo(() => columns.map((column, index) => {
    const key = getColumnKey(column as ColumnLike, index);
    const width = widths[key] ?? readWidth((column as ColumnLike).width) ?? defaultWidth;
    const originalOnHeaderCell = (column as ColumnLike).onHeaderCell;
    return {
      ...column,
      width,
      ellipsis: column.ellipsis ?? true,
      onHeaderCell: (col: unknown) => ({
        ...(originalOnHeaderCell ? originalOnHeaderCell(col) : {}),
        width,
        'data-column-key': key,
      }),
    } as ProColumns<T>;
  }), [columns, defaultWidth, widths]);

  const components = useMemo(() => ({ header: { cell: HeaderCell } }), [HeaderCell]);
  const scrollX = useMemo(
    () => resizableColumns.reduce((sum, column) => sum + (readWidth((column as ColumnLike).width) ?? defaultWidth), extraScrollWidth),
    [defaultWidth, extraScrollWidth, resizableColumns],
  );

  return { columns: resizableColumns, components, scrollX };
}
