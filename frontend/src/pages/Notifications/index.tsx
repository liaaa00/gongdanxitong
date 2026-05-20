import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import type { ProColumns, ActionType } from '@ant-design/pro-components';
import { ProTable } from '@ant-design/pro-components';
import { Tag, Button, Space, App, Badge, Tabs, Popconfirm, Switch, Modal, Descriptions, Typography } from 'antd';
import { BellOutlined, DeleteOutlined, CheckOutlined, EyeOutlined, LinkOutlined } from '@ant-design/icons';
import { getNotifications, markNotificationRead, markAllRead, deleteNotification, getUnreadCount } from '@/services/notifications';
import type { NotificationItem } from '@/services/notifications';
import type { PageParams } from '@/services/mock';

const { Text, Paragraph } = Typography;

const BIZ_COLOR: Record<string, string> = { sla: 'red', task: 'blue', system: 'default', field_change: 'purple', claim: 'orange' };
const PRI_COLOR: Record<string, string> = { urgent: 'red', normal: 'blue', low: 'default' };

const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const actionRef = useRef<ActionType>();
  const [activeTab, setActiveTab] = useState('all');
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [unreadByType, setUnreadByType] = useState<Record<string, number>>({});
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<NotificationItem | null>(null);

  const refreshCounts = async () => {
    try {
      const count = await getUnreadCount();
      setUnreadTotal(count);
      const result = await getNotifications({ unread: true, page: 1, pageSize: 100 });
      const list = Array.isArray(result?.list) ? result.list : [];
      setUnreadByType({
        all: list.filter((n) => !n.is_read).length,
        sla: list.filter((n) => n.biz_type === 'sla' && !n.is_read).length,
        task: list.filter((n) => n.biz_type === 'task' && !n.is_read).length,
        system: list.filter((n) => n.biz_type === 'system' && !n.is_read).length,
        field_change: list.filter((n) => n.biz_type === 'field_change' && !n.is_read).length,
      });
    } catch { /* ignore */ }
  };

  useEffect(() => {
    refreshCounts();
    const timer = setInterval(refreshCounts, 20000);
    return () => clearInterval(timer);
  }, []);

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      message.success('已标为已读');
    } catch { message.error('标记已读失败'); }
    refreshCounts();
    actionRef.current?.reload();
  };

  const handleDelete = async (id: string) => {
    await deleteNotification(id);
    message.success('已删除');
    refreshCounts();
    actionRef.current?.reload();
  };

  const handleMarkAll = async () => {
    try { await markAllRead(); message.success('已全部标为已读'); }
    catch { message.error('标记失败'); }
    refreshCounts();
    actionRef.current?.reload();
  };

  /** ★ 点击通知行 → 打开弹窗/跳转 */
  const handleRowClick = (record: NotificationItem) => {
    setDetailItem(record);
    setDetailOpen(true);
    if (!record.is_read) handleMarkRead(record.id); // 自动标已读
  };

  /** ★ 跳转关联工单 */
  const handleJumpToOrder = (orderNo?: string, orderId?: string) => {
    const target = orderId || orderNo;
    if (target) {
      setDetailOpen(false);
      navigate(`/work-orders/${target}`);
    }
  };

  const columns: ProColumns<NotificationItem>[] = [
    { title: '标题', dataIndex: 'title', key: 'title', width: 180 },
    { title: '类型', dataIndex: 'biz_type', key: 'biz_type', width: 90,
      render: (_, r) => {
        const labels: Record<string, string> = { sla: '服务时限告警', task: '任务', system: '系统', field_change: '变更', claim: '认领' };
        return <Tag color={BIZ_COLOR[r.biz_type]}>{labels[r.biz_type] || r.biz_type}</Tag>;
      },
    },
    { title: '优先级', dataIndex: 'priority', key: 'priority', width: 70,
      render: (_, r) => <Tag color={PRI_COLOR[r.priority]}>{r.priority === 'urgent' ? '紧急' : r.priority === 'normal' ? '普通' : '低'}</Tag>,
    },
    {
      title: '内容', dataIndex: 'content', key: 'content', width: 280, ellipsis: true,
      render: (_dom: unknown, r: NotificationItem) => (
        <Space size={4}>
          {!r.is_read && <Badge status="processing" />}
          <Text ellipsis style={{ maxWidth: 240 }}>
            {r.content}
            {r.diff_summary && <Text type="secondary" style={{ fontSize: 11 }}> | 变更: {r.diff_summary}</Text>}
          </Text>
        </Space>
      ),
    },
    {
      title: '关联', dataIndex: 'order_no', key: 'order_no', width: 120,
      render: (_dom: unknown, r: NotificationItem) =>
        (r.order_no || r.ref_order_no || r.ref_order_id) ? (
          <Button type="link" size="small" icon={<LinkOutlined />}
            onClick={() => handleJumpToOrder(r.order_no || r.ref_order_no, r.ref_order_id)}>
            {r.order_no || r.ref_order_no || '查看'}
          </Button>
        ) : <Text type="secondary">—</Text>,
    },
    { title: '时间', dataIndex: 'created_at', key: 'created_at', width: 150, valueType: 'dateTime' },
    {
      title: '操作', key: 'actions', width: 140, hideInSearch: true,
      render: (_, r) => (
        <Space>
          {!r.is_read && (
            <Button type="link" size="small" icon={<CheckOutlined />} onClick={(e) => { e.stopPropagation(); handleMarkRead(r.id); }}>标已读</Button>
          )}
          <Popconfirm title="确定删除？" onConfirm={(e) => { e?.stopPropagation(); handleDelete(r.id); }}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const tabItems = [
    { key: 'all', label: <Badge count={unreadByType.all || 0} size="small" offset={[6, -2]}>全部</Badge> },
    { key: 'sla', label: <Badge count={unreadByType.sla || 0} size="small" offset={[6, -2]}><Tag color="red" style={{ margin: 0 }}>服务时限</Tag></Badge> },
    { key: 'task', label: <Badge count={unreadByType.task || 0} size="small" offset={[6, -2]}>任务</Badge> },
    { key: 'system', label: <Badge count={unreadByType.system || 0} size="small" offset={[6, -2]}>系统</Badge> },
    { key: 'field_change', label: <Badge count={unreadByType.field_change || 0} size="small" offset={[6, -2]}><Tag color="purple" style={{ margin: 0 }}>变更</Tag></Badge> },
  ];

  return (
    <PageContainer
      header={{
        title: '消息通知',
        extra: [
          <span key="unreadToggle">
            只看未读 <Switch size="small" checked={unreadOnly} onChange={setUnreadOnly} style={{ marginLeft: 4, marginRight: 12 }} />
          </span>,
          <Badge key="total" count={unreadTotal}><BellOutlined style={{ fontSize: 16 }} /></Badge>,
          <Button key="readAll" size="small" onClick={handleMarkAll}>全部已读</Button>,
        ],
      }}
    >
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} style={{ marginBottom: -16 }} />
      <ProTable<NotificationItem>
        actionRef={actionRef}
        columns={columns}
        request={async (params: PageParams) => {
          const result = await getNotifications({
            ...params,
            biz_type: activeTab === 'all' ? undefined : activeTab,
            unread: unreadOnly ? true : undefined,
          });
          return { data: result.list, success: true, total: result.total };
        }}
        rowKey="id"
        search={{ labelWidth: 'auto' }}
        headerTitle="通知列表"
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
        dateFormatter="string"
        onRow={(record) => ({
          onClick: () => handleRowClick(record),
          style: { cursor: 'pointer' },
        })}
        options={{ reload: () => { refreshCounts(); actionRef.current?.reload(); } }}
      />

      {/* ★ 通知详情弹窗（含 diff 摘要） */}
      <Modal
        title={detailItem?.title || '通知详情'}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={[
          detailItem?.ref_order_id && (
            <Button key="jump" type="primary" icon={<EyeOutlined />}
              onClick={() => handleJumpToOrder(detailItem.ref_order_no, detailItem.ref_order_id)}>
              查看关联工单
            </Button>
          ),
          <Button key="close" onClick={() => setDetailOpen(false)}>关闭</Button>,
        ]}
        width={560}
      >
        {detailItem && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="类型">
              <Tag color={BIZ_COLOR[detailItem.biz_type]}>{detailItem.biz_type}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="优先级">
              <Tag color={PRI_COLOR[detailItem.priority]}>{detailItem.priority}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="时间">{detailItem.created_at}</Descriptions.Item>
            <Descriptions.Item label="内容"><Paragraph>{detailItem.content}</Paragraph></Descriptions.Item>
            {detailItem.diff_summary && (
              <Descriptions.Item label="变更摘要">
                <div style={{ padding: 8, background: '#f6ffed', borderRadius: 4, fontSize: 13 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>字段变更对比：</Text>
                  <Paragraph style={{ whiteSpace: 'pre-wrap', marginTop: 4, marginBottom: 0 }}>
                    {detailItem.diff_summary}
                  </Paragraph>
                </div>
              </Descriptions.Item>
            )}
            {detailItem.diff_fields && Array.isArray(detailItem.diff_fields) && (
              <Descriptions.Item label="变更字段">
                <Space wrap>
                  {detailItem.diff_fields.map((f: any) => (
                    <Tag key={f.field_code}>
                      {f.field_name || f.field_code}
                      {f.old_value !== undefined && `：${f.old_value} → ${f.new_value}`}
                    </Tag>
                  ))}
                </Space>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="关联工单">
              {detailItem.ref_order_no || detailItem.ref_order_id ? (
                <Button type="link" icon={<LinkOutlined />} size="small"
                  onClick={() => handleJumpToOrder(detailItem.ref_order_no, detailItem.ref_order_id)}>
                  {detailItem.ref_order_no || detailItem.ref_order_id}
                </Button>
              ) : '—'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </PageContainer>
  );
};

export default NotificationsPage;
