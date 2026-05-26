import { useRef, useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import type { ProColumns, ActionType } from '@ant-design/pro-components';
import { ProTable } from '@ant-design/pro-components';
import { Tag, Button, Space, App, Badge, Tabs, Popconfirm, Modal, Descriptions, Typography, Segmented } from 'antd';
import { BellOutlined, DeleteOutlined, CheckOutlined, EyeOutlined, LinkOutlined } from '@ant-design/icons';
import { getNotifications, markNotificationRead, markAllRead, markNotificationsReadByQuery, deleteNotification, getUnreadCountByBucket } from '@/services/notifications';
import type { NotificationItem } from '@/services/notifications';
import type { PageParams } from '@/services/mock';

const { Text, Paragraph } = Typography;

type NotificationTabKey =
  | 'all'
  | 'salesperson_field_changed'
  | 'salesperson_returned'
  | 'salesperson_urge_feedback'
  | 'salesperson_withdraw_void_result'
  | 'backend_creator_modified'
  | 'backend_urge'
  | 'backend_sla_warning'
  | 'backend_sla_breached'
  | 'backend_withdraw_void_request'
  | 'system';

const TAB_BUCKET_MAP: Record<NotificationTabKey, string | undefined> = {
  all: undefined,
  // 后道补充、接单、完成等结果反馈给业务员查看
  salesperson_field_changed: 'field_changed',
  salesperson_returned: 'returned',
  salesperson_urge_feedback: 'urge_feedback',
  salesperson_withdraw_void_result: 'withdraw_void_result',
  // 业务员修改公共字段后通知后道办理人
  backend_creator_modified: 'creator_modified',
  backend_urge: 'urge',
  backend_sla_warning: 'sla_warning',
  backend_sla_breached: 'sla_breached',
  backend_withdraw_void_request: 'withdraw_void_request',
  system: 'system',
};

const BIZ_COLOR: Record<string, string> = {
  all: 'default',
  salesperson_field_changed: 'purple',
  salesperson_returned: 'orange',
  salesperson_urge_feedback: 'gold',
  salesperson_withdraw_void_result: 'blue',
  backend_creator_modified: 'purple',
  backend_urge: 'gold',
  backend_sla_warning: 'orange',
  backend_sla_breached: 'red',
  backend_withdraw_void_request: 'volcano',
  system: 'default',
};

const BIZ_LABEL: Record<string, string> = {
  all: '全部消息',
  salesperson_field_changed: '后道数据修改',
  salesperson_returned: '退回',
  salesperson_urge_feedback: '催办反馈',
  salesperson_withdraw_void_result: '撤回/作废结果',
  backend_creator_modified: '业务员数据修改',
  backend_urge: '催办',
  backend_sla_warning: '即将超时',
  backend_sla_breached: '已超时',
  backend_withdraw_void_request: '撤回/作废申请',
  system: '系统',
};


const PRI_COLOR: Record<string, string> = { urgent: 'red', high: 'red', normal: 'blue', low: 'default' };

function normalizeBizType(value: string | undefined | null): string {
  return String(value || '').toLowerCase().replace(/[.:]/g, '_');
}

function classifyNotification(item: Pick<NotificationItem, 'biz_type' | 'type' | 'title' | 'content'>): NotificationTabKey {
  const raw = `${normalizeBizType(item.biz_type)} ${normalizeBizType(item.type)} ${item.title || ''} ${item.content || ''}`.toLowerCase();
  if (raw.includes('system')) return 'system';
  if (raw.includes('sla_breached') || raw.includes('sla_breach') || raw.includes('breached') || raw.includes('breach') || raw.includes('已超时') || raw.includes('超期')) return 'backend_sla_breached';
  if (raw.includes('sla_warning') || raw.includes('sla_warn') || raw.includes('warning') || raw.includes('timeout') || raw.includes('即将超时') || raw.includes('预警')) return 'backend_sla_warning';
  if (raw.includes('urge_feedback') || raw.includes('urge_replied') || raw.includes('urge_result')) return 'salesperson_urge_feedback';
  if (raw.includes('urge_received') || raw.includes('urge') || raw.includes('催办')) return 'backend_urge';
  if (raw.includes('withdraw_request') || raw.includes('void_request') || raw.includes('creator_withdraw') || raw.includes('creator_void') || raw.includes('撤回申请') || raw.includes('作废申请')) return 'backend_withdraw_void_request';
  if (raw.includes('withdraw_approved') || raw.includes('withdraw_rejected') || raw.includes('void_approved') || raw.includes('void_rejected') || raw.includes('withdraw_void_result')) return 'salesperson_withdraw_void_result';
  if (raw.includes('dispatched_returned') || raw.includes('returned') || raw.includes('return') || raw.includes('退回')) return 'salesperson_returned';
  if (raw.includes('dispatched_accepted') || raw.includes('dispatched_completed') || raw.includes('order_supplement_filled') || raw.includes('field_supplement') || raw.includes('field_supplemented') || raw.includes('backend_supplemented') || raw.includes('补充')) return 'salesperson_field_changed';
  if (raw.includes('order_field_changed') || raw.includes('creator_modified') || raw.includes('completed_modified') || raw.includes('modified_by_creator') || raw.includes('field_changed_by_creator') || raw.includes('initiator_modified') || raw.includes('业务员') && raw.includes('修改')) return 'backend_creator_modified';
  return 'system';
}

const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const actionRef = useRef<ActionType>();
  const [activeTab, setActiveTab] = useState<NotificationTabKey>('all');
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [unreadByType, setUnreadByType] = useState<Record<string, number>>({});
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<NotificationItem | null>(null);

  const refreshCounts = async () => {
    try {
      const counts = await getUnreadCountByBucket();
      const next: Record<string, number> = {
        salesperson_field_changed: counts.salesperson.field_changed || 0,
        salesperson_returned: counts.salesperson.returned || 0,
        salesperson_urge_feedback: counts.salesperson.urge_feedback || 0,
        salesperson_withdraw_void_result: counts.salesperson.withdraw_void_result || 0,
        backend_creator_modified: counts.backend.creator_modified || 0,
        backend_urge: counts.backend.urge || 0,
        backend_sla_warning: counts.backend.sla_warning || 0,
        backend_sla_breached: counts.backend.sla_breached || 0,
        backend_withdraw_void_request: counts.backend.withdraw_void_request || 0,
        system: counts.system || 0,
      };
      next.all = Object.values(next).reduce((sum, value) => sum + value, 0);
      setUnreadByType(next);
      setUnreadTotal(next.all || 0);
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

  const handleMarkCurrentCategoryRead = async () => {
    try {
      const result = await markNotificationsReadByQuery({ bucket: TAB_BUCKET_MAP[activeTab] }) as { affected?: number } | void;
      const affected = result && typeof result.affected === 'number' ? result.affected : 0;
      message.success(activeTab === 'all' ? '已将当前可见消息标为已读' : `已将当前分类 ${affected} 条未读消息标为已读`);
    } catch {
      message.error('标记当前分类失败');
    }
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
    { title: '分类', dataIndex: 'biz_type', key: 'biz_type', width: 130,
      render: (_, r) => {
        const bucket = classifyNotification(r);
        return <Tag color={BIZ_COLOR[bucket]}>{BIZ_LABEL[bucket]}</Tag>;
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

  const tabItems = useMemo(() => (Object.keys(TAB_BUCKET_MAP) as NotificationTabKey[]).map((key) => ({
    key,
    label: key === 'all'
      ? <Badge count={unreadByType.all || 0} size="small" offset={[6, -2]}>{BIZ_LABEL[key]}</Badge>
      : <Badge count={unreadByType[key] || 0} size="small" offset={[6, -2]}><Tag color={BIZ_COLOR[key]} style={{ margin: 0 }}>{BIZ_LABEL[key]}</Tag></Badge>,
  })), [unreadByType]);

  return (
    <PageContainer
      header={{
        title: '消息通知',
        subTitle: '分类数字和列表均按同一 bucket 口径筛选，红点只会在标记已读后消失。',
        extra: [
          <Segmented
            key="readFilter"
            size="small"
            value={readFilter}
            onChange={(value) => { setReadFilter(value as 'all' | 'unread' | 'read'); actionRef.current?.reload(); }}
            options={[
              { label: '全部', value: 'all' },
              { label: '未读', value: 'unread' },
              { label: '已读', value: 'read' },
            ]}
          />,
          <Badge key="total" count={unreadTotal}><BellOutlined style={{ fontSize: 16 }} /></Badge>,
        ],
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: -16 }}>
        <Tabs activeKey={activeTab} onChange={(key) => { setActiveTab(key as NotificationTabKey); actionRef.current?.reload(); }} items={tabItems} style={{ flex: 1, minWidth: 0 }} />
        <Space size="small" style={{ paddingBottom: 16 }}>
          <Button size="small" icon={<CheckOutlined />} onClick={handleMarkCurrentCategoryRead}>当前分类已读</Button>
          <Button size="small" onClick={handleMarkAll}>全部已读</Button>
        </Space>
      </div>
      <ProTable<NotificationItem>
        actionRef={actionRef}
        columns={columns}
        request={async (params: PageParams) => {
          const bucket = TAB_BUCKET_MAP[activeTab];
          const result = await getNotifications({
            ...params,
            bucket,
            includeDispatch: activeTab === 'all' ? true : undefined,
            unread: readFilter === 'unread' ? true : undefined,
            isRead: readFilter === 'read' ? true : undefined,
          });
          return { data: result.list || [], success: true, total: result.total ?? (result.list || []).length };
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
            <Descriptions.Item label="分类">
              {(() => {
                const bucket = classifyNotification(detailItem);
                return <Tag color={BIZ_COLOR[bucket]}>{BIZ_LABEL[bucket]}</Tag>;
              })()}
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
