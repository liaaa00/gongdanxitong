import { useMemo } from 'react';
import { Card, Tag, Badge, Empty } from 'antd';

interface KanbanViewProps<T extends Record<string, unknown>> {
  dataSource: T[];
  rowKey: string;
  columnKey: string;
  allowedValues: Array<{ value: string; label: string; color?: string }>;
  renderItem?: (item: T) => React.ReactNode;
}

const MAX_ITEMS_PER_COL = 500;

function KanbanView<T extends Record<string, unknown>>({
  dataSource, rowKey, columnKey, allowedValues, renderItem,
}: KanbanViewProps<T>) {
  const columns = useMemo(() => {
    return allowedValues.map((av) => ({
      ...av,
      items: dataSource
        .filter((item) => String(item[columnKey as string]) === av.value)
        .slice(0, MAX_ITEMS_PER_COL),
    }));
  }, [dataSource, columnKey, allowedValues]);

  const getColumnColor = (color?: string) => {
    switch (color) {
      case 'red': return '#ff4d4f';
      case 'green': return '#52c41a';
      case 'blue': return '#1677ff';
      case 'yellow': case 'orange': return '#faad14';
      default: return '#d9d9d9';
    }
  };

  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 16, minHeight: 300 }}>
      {columns.map((col) => (
        <Card
          key={col.value}
          size="small"
          title={
            <Tag color={col.color || 'default'}>{col.label}</Tag>
          }
          extra={<Badge count={dataSource.filter((i) => String(i[columnKey as string]) === col.value).length} style={{ backgroundColor: getColumnColor(col.color) }} />}
          style={{ minWidth: 260, flex: '0 0 auto', maxHeight: '70vh', overflow: 'auto' }}
          bodyStyle={{ padding: '4px 8px' }}
        >
          {col.items.length === 0 ? (
            <Empty description="无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {col.items.map((item) => (
                <Card key={String(item[rowKey as string] || '')} size="small"
                  hoverable
                  bodyStyle={{ padding: '6px 10px' }}
                  style={{ borderLeft: '3px solid ' + getColumnColor(col.color) }}>
                  {renderItem ? renderItem(item) : <span style={{ color: '#999' }}>暂无卡片视图，需配置 renderItem</span>}
                </Card>
              ))}
              {dataSource.filter((i) => String(i[columnKey as string]) === col.value).length > MAX_ITEMS_PER_COL && (
                <span style={{ fontSize: 12, color: '#999', textAlign: 'center' }}>
                  仅显示前 {MAX_ITEMS_PER_COL} 项
                </span>
              )}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

export default KanbanView;
