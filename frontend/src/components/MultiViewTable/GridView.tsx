import { useState } from 'react';
import { Input, Select, DatePicker, InputNumber } from 'antd';
import type { ProColumns } from '@ant-design/pro-components';

interface GridViewProps<T extends Record<string, unknown>> {
  dataSource: T[];
  rowKey: string;
  columns: ProColumns<T>[];
  editableKeys: string[];
  onInlineEdit?: (id: string, patch: Partial<T>) => Promise<void>;
}

function GridView<T extends Record<string, unknown>>({
  dataSource, rowKey, columns, editableKeys, onInlineEdit,
}: GridViewProps<T>) {
  const [editingCell, setEditingCell] = useState<{ row: string; col: string } | null>(null);
  const [values, setValues] = useState<Record<string, Record<string, unknown>>>({});

  const visibleColumns = columns.filter((c) => c.dataIndex && c.dataIndex !== 'actions' && c.key !== 'actions');

  const isEditable = (colKey: string) => editableKeys.includes(colKey);

  const handleEdit = (rowId: string, colKey: string) => {
    if (!isEditable(colKey)) return;
    setEditingCell({ row: rowId, col: colKey });
  };

  const handleBlur = async (rowId: string, colKey: string, value: unknown) => {
    setEditingCell(null);
    if (onInlineEdit) {
      const patch: Partial<T> = { [colKey]: value } as Partial<T>;
      await onInlineEdit(rowId, patch);
    }
  };

  const handlePasteRow = async (rowId: string, e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    const parts = text.split('\t');
    const patch: Record<string, unknown> = {};
    visibleColumns.forEach((col, i) => {
      const key = String(col.dataIndex || '');
      if (isEditable(key) && parts[i] !== undefined) {
        patch[key] = parts[i];
      }
    });
    if (Object.keys(patch).length > 0 && onInlineEdit) {
      await onInlineEdit(rowId, patch as Partial<T>);
    }
  };

  const renderCell = (item: T, col: ProColumns<T>) => {
    const key = String(col.dataIndex || '');
    const rawValue = item[key] as unknown;
    const cellValue = values[String(item[rowKey as string] || '')]?.[key] ?? rawValue;

    const isEditing = editingCell?.row === String(item[rowKey as string] || '') && editingCell?.col === key;

    if (isEditing) {
      if (col.valueType === 'select' || col.valueEnum) {
        const enumObj = col.valueEnum as Record<string, string> | undefined;
        const options = enumObj
          ? Object.entries(enumObj).map(([v, l]) => ({ value: v, label: l as string }))
          : [];
        return (
          <Select
            size="small"
            autoFocus
            style={{ width: '100%' }}
            value={String(cellValue ?? '')}
            options={options}
            getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
            onChange={(v) => handleBlur(String(item[rowKey as string] || ''), key, v)}
            onBlur={() => setEditingCell(null)}
          />
        );
      }
      if (col.valueType === 'dateTime' || col.valueType === 'date') {
        return (
          <DatePicker
            size="small"
            autoFocus
            style={{ width: '100%' }}
            getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
            onChange={(_, dateStr) => handleBlur(String(item[rowKey as string] || ''), key, dateStr)}
            onBlur={() => setEditingCell(null)}
          />
        );
      }
      if (col.valueType === 'digit' || String(col.valueType) === 'number' || col.valueType === 'money') {
        return (
          <InputNumber
            size="small"
            autoFocus
            style={{ width: '100%' }}
            value={Number(cellValue) || undefined}
            onChange={(v) => handleBlur(String(item[rowKey as string] || ''), key, v)}
            onBlur={() => setEditingCell(null)}
          />
        );
      }
      return (
        <Input
          size="small"
          autoFocus
          value={String(cellValue ?? '')}
          onChange={(e) => {
            const rowId = String(item[rowKey as string] || '');
            setValues((prev) => ({ ...prev, [rowId]: { ...prev[rowId], [key]: e.target.value } }));
          }}
          onBlur={(e) => handleBlur(String(item[rowKey as string] || ''), key, e.target.value)}
        />
      );
    }

    if (col.render) {
      const fn = col.render as (dom: React.ReactNode, entity: unknown, index: number) => React.ReactNode;
      return fn(String(cellValue ?? ''), item, 0);
    }

    return String(cellValue ?? '');
  };

  return (
    <div style={{ overflow: 'auto' }}>
      <table className="mv-grid-table" style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <thead>
          <tr>
            {visibleColumns.map((col) => (
              <th key={String(col.dataIndex || '')} style={{
                padding: '6px 8px', borderBottom: '2px solid #e8e8e8',
                background: '#fafafa', textAlign: 'left', whiteSpace: 'nowrap',
                position: 'sticky', top: 0, zIndex: 1,
              }}>
                {col.title as string}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataSource.map((item) => (
            <tr key={String(item[rowKey as string] || '')}
              onDoubleClick={(e) => {
                const target = e.target as HTMLElement;
                const cell = target.closest('td');
                if (!cell) return;
                const colIdx = Array.from((cell.parentElement?.children || []) as unknown as HTMLElement[]).indexOf(cell);
                const col = visibleColumns[colIdx];
                if (col) handleEdit(String(item[rowKey as string] || ''), String(col.dataIndex || ''));
              }}
              onPaste={(e) => handlePasteRow(String(item[rowKey as string] || ''), e)}
              style={{ borderBottom: '1px solid #f0f0f0' }}>
              {visibleColumns.map((col) => {
                const key = String(col.dataIndex || '');
                return (
                  <td key={key}
                    onClick={() => isEditable(key) && handleEdit(String(item[rowKey as string] || ''), key)}
                    style={{
                      padding: '4px 8px', borderBottom: '1px solid #f0f0f0',
                      cursor: isEditable(key) ? 'cell' : 'default',
                    }}>
                    {renderCell(item, col)}
                  </td>
                );
              })}
            </tr>
          ))}
          {dataSource.length === 0 && (
            <tr>
              <td colSpan={visibleColumns.length} style={{ textAlign: 'center', padding: 24, color: '#999' }}>
                暂无数据
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default GridView;
