import { useState, useMemo } from 'react';
import { Select, Button, Tag, Space, Modal, Input, App } from 'antd';
import { FilterOutlined, SaveOutlined, DeleteOutlined } from '@ant-design/icons';
import type { SavedFilter, FilterCondition } from './types';
import type { ProColumns } from '@ant-design/pro-components';

const STORAGE_PREFIX = 'mv_filters_';

function buildConditionLabel(cond: FilterCondition, columns: ProColumns<Record<string, unknown>>[]): string {
  const col = columns.find((c) => (c.dataIndex || c.key) === cond.field);
  const label = (col?.title as string) || cond.field;
  const opMap: Record<string, string> = {
    eq: '等于', ne: '不等于', contains: '包含', gt: '大于', lt: '小于', gte: '大于等于', lte: '小于等于', in: '属于',
  };
  return `${label} ${opMap[cond.op] || '未知操作符'} ${String(cond.value)}`;
}

interface FilterViewsProps {
  viewId: string;
  columns: ProColumns<Record<string, unknown>>[];
  activeFilterId: string | null;
  onFilterSelect: (filter: SavedFilter | null) => void;
  currentConditions: FilterCondition[];
  onConditionsChange: (conds: FilterCondition[]) => void;
}

const FilterViews: React.FC<FilterViewsProps> = ({
  viewId, columns, activeFilterId, onFilterSelect, currentConditions, onConditionsChange,
}) => {
  const { message } = App.useApp();
  const storageKey = STORAGE_PREFIX + viewId;
  const [saveOpen, setSaveOpen] = useState(false);
  const [filterName, setFilterName] = useState('');

  const savedFilters = useMemo<SavedFilter[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '[]');
    } catch { return []; }
  }, [storageKey, saveOpen]);

  const persistFilters = (filters: SavedFilter[]) => {
    localStorage.setItem(storageKey, JSON.stringify(filters));
  };

  const handleSave = () => {
    if (!filterName.trim()) return;
    if (currentConditions.length === 0) {
      message.warning('请先设置筛选条件');
      return;
    }
    const newFilter: SavedFilter = {
      id: 'f_' + Date.now(),
      name: filterName.trim(),
      conditions: currentConditions,
    };
    persistFilters([...savedFilters, newFilter]);
    message.success('筛选视图已保存');
    setSaveOpen(false);
    setFilterName('');
  };

  const handleDelete = (id: string) => {
    persistFilters(savedFilters.filter((f) => f.id !== id));
    if (activeFilterId === id) onFilterSelect(null);
    message.success('已删除');
  };

  const activeFilterOptions = savedFilters.map((f) => ({
    label: f.name, value: f.id,
  }));

  return (
    <Space size={8} wrap>
      <Select
        placeholder="常用筛选视图"
        size="small"
        style={{ minWidth: 160 }}
        allowClear
        value={activeFilterId}
        options={activeFilterOptions}
        getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
        onChange={(val) => {
          if (!val) { onFilterSelect(null); return; }
          const found = savedFilters.find((f) => f.id === val);
          if (found) onFilterSelect(found);
        }}
      />
      {currentConditions.length > 0 && (
        <>
          {currentConditions.map((c, i) => (
            <Tag key={i} closable onClose={() => {
              const next = currentConditions.filter((_, idx) => idx !== i);
              onConditionsChange(next);
            }}>
              <FilterOutlined /> {buildConditionLabel(c, columns)}
            </Tag>
          ))}
          <Button size="small" icon={<SaveOutlined />}
            onClick={() => { setFilterName(''); setSaveOpen(true); }}>
            保存视图
          </Button>
        </>
      )}
      {activeFilterId && savedFilters.find((f) => f.id === activeFilterId) && (
        <Button size="small" danger icon={<DeleteOutlined />}
          onClick={() => handleDelete(activeFilterId)} />
      )}
      <Modal title="保存筛选视图" open={saveOpen} onOk={handleSave}
        onCancel={() => setSaveOpen(false)}>
        <Input placeholder="视图名称" value={filterName}
          onChange={(e) => setFilterName(e.target.value)} />
      </Modal>
    </Space>
  );
};

export default FilterViews;
