import { useMemo, useState } from 'react';
import { Drawer, Checkbox, Space, Button, App } from 'antd';
import { HolderOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';

const STORAGE_PREFIX = 'mv_config_';

interface ColumnsConfigDrawerProps {
  open: boolean;
  onClose: () => void;
  viewId: string;
  columns: ProColumns<Record<string, unknown>>[];
  hiddenKeys: string[];
  onHiddenKeysChange: (keys: string[]) => void;
  order: string[];
  onOrderChange: (order: string[]) => void;
}

export function reorderColumnKeys(order: string[], draggedKey: string, targetKey: string): string[] {
  if (draggedKey === targetKey) return order;
  const from = order.indexOf(draggedKey);
  const to = order.indexOf(targetKey);
  if (from < 0 || to < 0) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, draggedKey);
  return next;
}

const ColumnsConfigDrawer: React.FC<ColumnsConfigDrawerProps> = ({
  open, onClose, viewId, columns, hiddenKeys, onHiddenKeysChange, order: colOrder, onOrderChange,
}) => {
  const { message } = App.useApp();
  const storageKey = STORAGE_PREFIX + viewId;
  const [draggedKey, setDraggedKey] = useState<string | null>(null);

  const visibleColumns = useMemo(
    () => columns.filter((c) => !c.hideInTable && c.dataIndex !== 'actions' && c.key !== 'actions'),
    [columns],
  );

  const handleToggle = (key: string, checked: boolean) => {
    const next = checked
      ? hiddenKeys.filter((k) => k !== key)
      : [...hiddenKeys, key];
    onHiddenKeysChange(next);
  };

  const handleMoveUp = (key: string) => {
    const idx = colOrder.indexOf(key);
    if (idx <= 0) return;
    const next = [...colOrder];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    onOrderChange(next);
  };

  const handleMoveDown = (key: string) => {
    const idx = colOrder.indexOf(key);
    if (idx < 0 || idx >= colOrder.length - 1) return;
    const next = [...colOrder];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    onOrderChange(next);
  };

  const handleSave = () => {
    let existing: Record<string, unknown> = {};
    try {
      existing = JSON.parse(localStorage.getItem(storageKey) || '{}') as Record<string, unknown>;
    } catch {
      existing = {};
    }
    localStorage.setItem(storageKey, JSON.stringify({
      ...existing,
      columnsOrder: colOrder,
      columnsHidden: hiddenKeys,
    }));
    message.success('列配置已保存');
    onClose();
  };

  const handleDrop = (targetKey: string) => {
    if (!draggedKey) return;
    const next = reorderColumnKeys(colOrder, draggedKey, targetKey);
    if (next !== colOrder) onOrderChange(next);
    setDraggedKey(null);
  };

  const handleReset = () => {
    const allKeys = visibleColumns.map((c) => (c.dataIndex || c.key) as string);
    onHiddenKeysChange([]);
    onOrderChange(allKeys);
  };

  const sortedColumns = [...visibleColumns].sort((a, b) => {
    const ai = colOrder.indexOf((a.dataIndex || a.key) as string);
    const bi = colOrder.indexOf((b.dataIndex || b.key) as string);
    const aIdx = ai >= 0 ? ai : 999;
    const bIdx = bi >= 0 ? bi : 999;
    return aIdx - bIdx;
  });

  return (
    <Drawer title="列配置" open={open} onClose={onClose} width={320} getContainer={() => document.body}
      extra={<Space><Button size="small" onClick={handleReset}>恢复默认</Button><Button size="small" type="primary" onClick={handleSave}>保存</Button></Space>}>
      <Space direction="vertical" style={{ width: '100%' }}>
        {sortedColumns.map((col) => {
          const key = (col.dataIndex || col.key) as string;
          const isHidden = hiddenKeys.includes(key);
          return (
            <div
              key={key}
              draggable
              onDragStart={() => setDraggedKey(key)}
              onDragEnd={() => setDraggedKey(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDrop(key)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', cursor: 'grab' }}
            >
              <Checkbox checked={!isHidden} onChange={(e) => handleToggle(key, e.target.checked)}>
                {col.title as string || key}
              </Checkbox>
              <Space size={2}>
                <Button type="text" size="small" icon={<HolderOutlined style={{ transform: 'rotate(90deg)' }} />}
                  onClick={() => handleMoveUp(key)} />
                <Button type="text" size="small" icon={<HolderOutlined style={{ transform: 'rotate(-90deg)' }} />}
                  onClick={() => handleMoveDown(key)} />
              </Space>
            </div>
          );
        })}
      </Space>
    </Drawer>
  );
};

export default ColumnsConfigDrawer;
