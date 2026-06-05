import type { ProColumns } from '@ant-design/pro-components';
import { Button, Input, Radio, Space } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

export function mergeProTableFiltersIntoParams(
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

export function textHeaderFilter<T extends Record<string, unknown> = Record<string, unknown>>(
  placeholder: string,
): Pick<ProColumns<T>, 'filterDropdown' | 'filterIcon'> {
  return {
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }) => (
      <div style={{ padding: 8, width: 260 }} onKeyDown={(event) => event.stopPropagation()}>
        <Input
          allowClear
          autoFocus
          placeholder={placeholder}
          value={String(selectedKeys[0] ?? '')}
          onChange={(event) => setSelectedKeys(event.target.value ? [event.target.value] : [])}
          onPressEnter={() => confirm()}
          style={{ marginBottom: 8, display: 'block' }}
        />
        <Space>
          <Button type="primary" size="small" icon={<SearchOutlined />} onClick={() => confirm()}>
            筛选
          </Button>
          <Button
            size="small"
            onClick={() => {
              clearFilters?.();
              confirm();
            }}
          >
            重置
          </Button>
          <Button size="small" onClick={() => close?.()}>
            取消
          </Button>
        </Space>
      </div>
    ),
    filterIcon: (filtered) => <SearchOutlined style={{ color: filtered ? '#1677ff' : undefined }} />,
  };
}

export function selectHeaderFilter<T extends Record<string, unknown> = Record<string, unknown>>(
  placeholder: string,
  options: ReadonlyArray<{ label: string; value: string }>,
): Pick<ProColumns<T>, 'filterDropdown' | 'filterIcon'> {
  return {
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }) => (
      <div style={{ padding: 8, width: 220 }} onKeyDown={(event) => event.stopPropagation()}>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{placeholder}</div>
        <Space style={{ borderBottom: '1px solid #f0f0f0', paddingBottom: 8, marginBottom: 8 }}>
          <Button type="primary" size="small" icon={<SearchOutlined />} onClick={() => confirm()}>
            筛选
          </Button>
          <Button
            size="small"
            onClick={() => {
              clearFilters?.();
              confirm();
            }}
          >
            重置
          </Button>
          <Button size="small" onClick={() => close?.()}>
            取消
          </Button>
        </Space>
        <div style={{ maxHeight: 180, overflowY: 'auto', paddingRight: 4 }}>
          <Radio.Group
            value={selectedKeys[0] as string | undefined}
            onChange={(event) => setSelectedKeys(event.target.value ? [event.target.value] : [])}
            style={{ width: '100%' }}
          >
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              {options.map((item) => (
                <Radio key={item.value} value={item.value}>{item.label}</Radio>
              ))}
            </Space>
          </Radio.Group>
        </div>
      </div>
    ),
    filterIcon: (filtered) => <SearchOutlined style={{ color: filtered ? '#1677ff' : undefined }} />,
  };
}
