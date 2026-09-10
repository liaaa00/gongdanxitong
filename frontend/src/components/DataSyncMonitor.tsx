import { useEffect, useState } from 'react';
import { AlertOutlined, CheckCircleOutlined, ClockCircleOutlined, SyncOutlined } from '@ant-design/icons';
import { Card, Col, Empty, Row, Segmented, Space, Spin, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { getDataSyncMonitor, type DataSyncMonitorRecord, type DataSyncMonitorResult } from '@/services/dashboard';

const { Text } = Typography;

type DataSyncMonitorProps = { visible: boolean };

const EMPTY_RESULT: DataSyncMonitorResult = {
  windowDays: 30,
  summary: {
    totalBatches: 0,
    directSyncedBatches: 0,
    approvalPendingBatches: 0,
    approvedBatches: 0,
    rejectedBatches: 0,
    partialBatches: 0,
    pendingItems: 0,
    rejectedItems: 0,
    activeDirtyMarks: 0,
    alertCount: 0,
  },
  records: [],
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  direct_synced: { label: '已直接回写', color: 'green' },
  approval_pending: { label: '待审批回写', color: 'orange' },
  approved: { label: '已审批', color: 'blue' },
  rejected: { label: '回写拒绝', color: 'red' },
  partial: { label: '部分回写', color: 'orange' },
};

function formatDate(value: string): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

function statusMeta(status: string) {
  return STATUS_META[status] || { label: status || '未知', color: 'default' };
}

const columns: ColumnsType<DataSyncMonitorRecord> = [
  { title: '工单号', dataIndex: 'orderNo', key: 'orderNo', width: 170, render: (value) => <Text strong>{value || '-'}</Text> },
  { title: '客户', dataIndex: 'customerName', key: 'customerName', ellipsis: true, render: (value) => value || '-' },
  { title: '来源模块', dataIndex: 'sourceModuleCode', key: 'sourceModuleCode', width: 150, render: (value) => <Tag color="blue">{value || '-'}</Tag> },
  {
    title: '回写状态', dataIndex: 'status', key: 'status', width: 130,
    render: (value: string) => { const meta = statusMeta(value); return <Tag color={meta.color}>{meta.label}</Tag>; },
  },
  {
    title: '变更字段', dataIndex: 'changedFields', key: 'changedFields', width: 220,
    render: (fields: string[]) => fields.length ? <Space wrap size={[4, 4]}>{fields.slice(0, 4).map((field) => <Tag key={field}>{field}</Tag>)}{fields.length > 4 && <Text type="secondary">+{fields.length - 4}</Text>}</Space> : '-',
  },
  {
    title: '待处理/拒绝', key: 'pending', width: 120,
    render: (_, record) => <Text type={record.pendingItemCount || record.rejectedItemCount ? 'danger' : 'secondary'}>{record.pendingItemCount} / {record.rejectedItemCount}</Text>,
  },
  { title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt', width: 180, render: (value) => formatDate(value) },
];

const DataSyncMonitor: React.FC<DataSyncMonitorProps> = ({ visible }) => {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DataSyncMonitorResult>(EMPTY_RESULT);

  useEffect(() => {
    if (!visible) return undefined;
    let mounted = true;
    setLoading(true);
    getDataSyncMonitor(days)
      .then((result) => { if (mounted) setData(result); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [days, visible]);

  if (!visible) return null;
  const { summary } = data;

  return (
    <Card
      title={<Space><AlertOutlined style={{ color: '#1677ff' }} />数据回写监控预警</Space>}
      extra={<Segmented size="small" value={days} onChange={(value) => setDays(Number(value))} options={[{ label: '近7天', value: 7 }, { label: '近30天', value: 30 }, { label: '近90天', value: 90 }]} />}
    >
      <Spin spinning={loading}>
        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          <Col xs={12} md={6}><Card size="small"><Statistic title="待回写/待审批" value={summary.approvalPendingBatches + summary.pendingItems} prefix={<ClockCircleOutlined />} valueStyle={{ color: '#fa8c16' }} /></Card></Col>
          <Col xs={12} md={6}><Card size="small"><Statistic title="部分回写" value={summary.partialBatches} prefix={<SyncOutlined />} valueStyle={{ color: '#d48806' }} /></Card></Col>
          <Col xs={12} md={6}><Card size="small"><Statistic title="回写异常" value={summary.rejectedBatches + summary.rejectedItems} prefix={<AlertOutlined />} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
          <Col xs={12} md={6}><Card size="small"><Statistic title="未确认数据变更" value={summary.activeDirtyMarks} prefix={<CheckCircleOutlined />} valueStyle={{ color: summary.activeDirtyMarks ? '#fa8c16' : '#52c41a' }} /></Card></Col>
        </Row>
        <Space direction="vertical" size={8} style={{ width: '100%', marginBottom: 12 }}>
          <Text type="secondary">统计窗口：近 {data.windowDays} 天；共 {summary.totalBatches} 批回写记录，已直接回写 {summary.directSyncedBatches} 批，已审批 {summary.approvedBatches} 批。</Text>
          {summary.alertCount > 0 && <Text type="warning">当前有 {summary.alertCount} 项待处理或异常记录，请优先核查。</Text>}
        </Space>
        <Table<DataSyncMonitorRecord>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={data.records}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          scroll={{ x: 1050 }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据回写记录" /> }}
        />
      </Spin>
    </Card>
  );
};

export default DataSyncMonitor;
