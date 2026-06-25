import { useMemo } from 'react';
import { Drawer, Checkbox, Space, Button, App } from 'antd';
import { HolderOutlined } from '@ant-design/icons';
import type { ProColumns } from '@ant-design/pro-components';

const STORAGE_PREFIX = 'mv_columns_';

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

const ColumnsConfigDrawer: React.FC<ColumnsConfigDrawerProps> = ({
  open, onClose, viewId, columns, hiddenKeys, onHiddenKeysChange, order: colOrder, onOrderChange,
}) => {
  const { message } = App.useApp();
  const storageKey = STORAGE_PREFIX + viewId;

  const visibleColumns = useMemo(
    () => columns.filter((c) => c.dataIndex !== 'actions' && c.key !== 'actions'),
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
    const config = { hiddenKeys, order: colOrder };
    localStorage.setItem(storageKey, JSON.stringify(config));
    message.success('列配置已保存');
    onClose();
  };

  const handleReset = () => {
    const allKeys = visibleColumns.map((c) => (c.dataIndex || c.key) as string);
    onHiddenKeysChange([]);
    onOrderChange(allKeys);
  };

  const sortedColumns = visibleColumns.sort((a, b) => {
    const ai = colOrder.indexOf((a.dataIndex || a.key) as string);
    const bi = colOrder.indexOf((b.dataIndex || b.key) as string);
    const aIdx = ai >= 0 ? ai : 999;
    const bIdx = bi >= 0 ? bi : 999;
    return aIdx - bIdx;
  });

  return (
    <Drawer title="列配置" open={open} onClose={onClose} width={320}
      extra={<Space><Button size="small" onClick={handleReset}>恢复默认</Button><Button size="small" type="primary" onClick={handleSave}>保存</Button></Space>}>
      <Space direction="vertical" style={{ width: '100%' }}>
        {sortedColumns.map((col) => {
          const key = (col.dataIndex || col.key) as string;
          const isHidden = hiddenKeys.includes(key);
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
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
