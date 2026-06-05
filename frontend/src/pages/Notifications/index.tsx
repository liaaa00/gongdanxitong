import { useRef, useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import type { ProColumns, ActionType } from '@ant-design/pro-components';
import { ProTable } from '@ant-design/pro-components';
import { Tag, Button, Space, App, Badge, Tabs, Modal, Descriptions, Typography, Tooltip, Segmented } from 'antd';
import { BellOutlined, EyeOutlined, LinkOutlined } from '@ant-design/icons';
import { getNotifications, getUnreadCountByBucket, markNotificationRead } from '@/services/notifications';
import type { NotificationItem } from '@/services/notifications';
import type { PageParams } from '@/services/mock';
import { useAuth } from '@/hooks/useAuth';
import { ROLE } from '@/constants/roles';
import {
  getNotificationDisplayContent,
  getNotificationDisplayTitle,
  getNotificationFieldLabel,
  getNotificationOperatorName,
  localizeNotificationInternalKeys,
} from '@/utils/notificationDisplay';
export {
  getNotificationDisplayContent,
  getNotificationDisplayTitle,
  getNotificationFieldLabel,
  getNotificationOperatorName,
  localizeNotificationInternalKeys,
} from '@/utils/notificationDisplay';

const { Text, Paragraph } = Typography;

type NotificationTabKey = 'all' | 'todo' | 'returned' | 'field_changed' | 'withdraw_void' | 'system';
type ReadFilterKey = 'all' | 'unread' | 'read';

const BACKEND_ROLES = [
  ROLE.DATA_ENTRY_LEADER,
  ROLE.SHARED_TEAM_OWNER,
  ROLE.LABOR_CONTRACT_MEMBER,
  ROLE.ONBOARDING_RESIGNATION_MEMBER,
  ROLE.SOCIAL_INSURANCE_SPECIALIST,
];
const BUSINESS_ROLES = [ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER];

const ALL_TAB_KEYS: NotificationTabKey[] = ['all', 'todo', 'returned', 'field_changed', 'withdraw_void', 'system'];
const BUSINESS_TAB_KEYS: NotificationTabKey[] = ['all', 'returned', 'field_changed', 'withdraw_void', 'system'];
const BACKEND_TAB_KEYS: NotificationTabKey[] = ['all', 'todo', 'field_changed', 'withdraw_void', 'system'];

const TAB_BUCKET_MAP: Record<NotificationTabKey, string | undefined> = {
  all: undefined,
  todo: 'todo',
  returned: 'returned',
  field_changed: 'field_changed,creator_modified',
  withdraw_void: undefined,
  system: 'system',
};

const BIZ_COLOR: Record<NotificationTabKey | string, string> = {
  all: 'default',
  todo: 'blue',
  returned: 'orange',
  field_changed: 'purple',
  withdraw_void: 'volcano',
  system: 'default',
};

const BIZ_LABEL: Record<NotificationTabKey | string, string> = {
  all: '全部消息',
  todo: '待处理',
  returned: '退回/待修改',
  field_changed: '字段变更',
  withdraw_void: '撤回/作废',
  system: '系统',
};

const PRI_COLOR: Record<string, string> = { urgent: 'red', normal: 'blue', low: 'default', high: 'red' };
const PRI_LABEL: Record<string, string> = { urgent: '紧急', high: '高', normal: '普通', low: '低' };

function rawNotificationText(item: Pick<NotificationItem, 'biz_type' | 'type' | 'title' | 'content'>): string {
  return `${item.biz_type || ''} ${item.type || ''} ${item.title || ''} ${item.content || ''}`.toLowerCase().replace(/[.:]/g, '_');
}

function classifyNotification(item: Pick<NotificationItem, 'biz_type' | 'type' | 'title' | 'content'>): NotificationTabKey {
  const raw = rawNotificationText(item);
  if (raw.includes('system')) return 'system';
  if (raw.includes('withdraw') || raw.includes('void') || raw.includes('撤回') || raw.includes('作废')) return 'withdraw_void';
  if (raw.includes('returned') || raw.includes('return') || raw.includes('退回')) return 'returned';
  if (raw.includes('dispatch') || raw.includes('todo') || raw.includes('task') || raw.includes('claim') || raw.includes('待处理')) return 'todo';
  if (raw.includes('field_changed') || raw.includes('field_change') || raw.includes('supplement') || raw.includes('modified') || raw.includes('修改') || raw.includes('补充')) return 'field_changed';
  return 'system';
}

function normalizeJumpLink(link: string, notificationId: string): string {
  const normalized = link
    .replace(/^\/dispatched\//, '/my-dispatched/')
    .replace(/^\/dispatched-orders\//, '/my-dispatched/');
  return `${normalized}${normalized.includes('?') ? '&' : '?'}fromNotification=${notificationId}`;
}

function canProcess(item: NotificationItem): boolean {
  return Boolean(item.entity_id || item.ref_order_id || item.ref_order_no || item.order_no || item.link);
}

function readFilterParams(filter: ReadFilterKey): Pick<PageParams & { unread?: boolean; isRead?: boolean }, 'unread' | 'isRead'> {
  if (filter === 'unread') return { unread: true };
  if (filter === 'read') return { isRead: true };
  return {};
}

function isWithdrawVoidBucket(item: NotificationItem): boolean {
  const raw = rawNotificationText(item);
  return raw.includes('withdraw') || raw.includes('void') || raw.includes('撤回') || raw.includes('作废');
}

const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { hasRole, hasAnyRole } = useAuth();
  const actionRef = useRef<ActionType>();
  const [activeTab, setActiveTab] = useState<NotificationTabKey>('all');
  const [readFilter, setReadFilter] = useState<ReadFilterKey>('all');
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [unreadByType, setUnreadByType] = useState<Record<string, number>>({});
  const [readLoadingId, setReadLoadingId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<NotificationItem | null>(null);

  const visibleTabKeys = useMemo<NotificationTabKey[]>(() => {
    if (hasRole(ROLE.ADMIN)) return ALL_TAB_KEYS;
    const isBusiness = hasAnyRole(BUSINESS_ROLES);
    const isBackend = hasAnyRole(BACKEND_ROLES);
    if (isBusiness && !isBackend) return BUSINESS_TAB_KEYS;
    if (isBackend && !isBusiness) return BACKEND_TAB_KEYS;
    if (isBusiness) return BUSINESS_TAB_KEYS;
    return BACKEND_TAB_KEYS;
  }, [hasAnyRole, hasRole]);

  useEffect(() => {
    if (!visibleTabKeys.includes(activeTab)) setActiveTab('all');
  }, [activeTab, visibleTabKeys]);

  const refreshCounts = async () => {
    try {
      const counts = await getUnreadCountByBucket();
      const next: Record<string, number> = {
        todo: counts.backend.todo || 0,
        returned: counts.salesperson.returned || 0,
        field_changed: (counts.salesperson.field_changed || 0) + (counts.backend.creator_modified || 0),
        withdraw_void: (counts.salesperson.withdraw_void_result || 0) + (counts.backend.withdraw_void_request || 0),
        system: counts.system || 0,
      };
      next.all = counts.total || visibleTabKeys.filter((key) => key !== 'all').reduce((sum, key) => sum + (next[key] || 0), 0);
      setUnreadByType(next);
      setUnreadTotal(next.all || 0);
    } catch {
      // 计数失败不影响列表使用。
    }
  };

  useEffect(() => {
    refreshCounts();
    const timer = setInterval(refreshCounts, 20000);
    return () => clearInterval(timer);
  }, [visibleTabKeys]);

  const reloadList = () => {
    void refreshCounts();
    actionRef.current?.reload();
  };

  const handleRowClick = (record: NotificationItem) => {
    setDetailItem(record);
    setDetailOpen(true);
  };

  const handleMarkRead = async (record: NotificationItem) => {
    if (record.is_read) return;
    setReadLoadingId(record.id);
    try {
      await markNotificationRead(record.id);
      message.success('已读已确认，提醒已消除');
      if (detailItem?.id === record.id) setDetailItem({ ...detailItem, is_read: true });
      reloadList();
    } catch {
      message.error('标记已读失败');
    } finally {
      setReadLoadingId(null);
    }
  };

  const handleJumpToOrder = (orderNo?: string, orderId?: string, item?: NotificationItem) => {
    const rawType = `${item?.biz_type || ''} ${item?.type || ''}`.toLowerCase();
    const shouldOpenEdit = rawType.includes('returned') || rawType.includes('return') || rawType.includes('withdraw_approved') || rawType.includes('dispatched_returned');
    if (item?.entity_type === 'dispatched_order' && item.entity_id) {
      const query = new URLSearchParams();
      query.set('fromNotification', item.id);
      if (shouldOpenEdit) query.set('action', 'edit');
      if (orderNo) query.set('highlightOrderNo', orderNo);
      setDetailOpen(false);
      navigate(`/my-dispatched/${item.entity_id}?${query.toString()}`);
      return;
    }

    const target = orderId || orderNo;
    if (!target && item?.link) {
      setDetailOpen(false);
      navigate(normalizeJumpLink(item.link, item.id));
      return;
    }
    if (target) {
      const query = new URLSearchParams();
      if (item?.id) query.set('fromNotification', item.id);
      if (orderNo) query.set('highlightOrderNo', orderNo);
      if (item?.diff_fields?.length) {
        const fields = item.diff_fields.map((f) => f.field_code).filter(Boolean);
        query.set('highlightFields', fields.join(','));
        if (fields[0]) query.set('focus', fields[0]);
      }
      const qs = query.toString();
      setDetailOpen(false);
      navigate(`/work-orders/${target}${qs ? `?${qs}` : ''}`);
    } else {
      message.info('该消息暂无可处理的关联工单');
    }
  };

  const columns: ProColumns<NotificationItem>[] = [
    {
      title: '状态',
      dataIndex: 'is_read',
      key: 'is_read',
      width: 76,
      hideInSearch: true,
      render: (_, r) => r.is_read ? <Tag>已读</Tag> : <Tag color="blue">未读</Tag>,
    },
    { title: '标题', dataIndex: 'title', key: 'title', width: 220, ellipsis: true },
    {
      title: '分类', dataIndex: 'biz_type', key: 'biz_type', width: 120,
      render: (_, r) => {
        const bucket = classifyNotification(r);
        return <Tag color={BIZ_COLOR[bucket]}>{BIZ_LABEL[bucket]}</Tag>;
      },
    },
    {
      title: '优先级', dataIndex: 'priority', key: 'priority', width: 88,
      render: (_, r) => <Tag color={PRI_COLOR[r.priority]}>{PRI_LABEL[r.priority] || r.priority || '普通'}</Tag>,
    },
    {
      title: '内容', dataIndex: 'content', key: 'content', width: 380, ellipsis: true,
      render: (_dom: unknown, r: NotificationItem) => {
        const displayContent = getNotificationDisplayContent(r);
        return (
          <Space size={4}>
            {!r.is_read && <Badge status="processing" />}
            <Tooltip title={displayContent}>
              <Text ellipsis style={{ maxWidth: 340 }}>
                {displayContent}
                {r.diff_summary && <Text mark style={{ marginLeft: 6, fontSize: 12 }}>变更</Text>}
              </Text>
            </Tooltip>
          </Space>
        );
      },
    },
    {
      title: '关联工单', dataIndex: 'order_no', key: 'order_no', width: 140,
      render: (_dom: unknown, r: NotificationItem) =>
        (r.order_no || r.ref_order_no || r.ref_order_id || r.entity_id) ? (
          <Button type="link" size="small" icon={<LinkOutlined />}
            onClick={(e) => { e.stopPropagation(); handleJumpToOrder(r.order_no || r.ref_order_no, r.ref_order_id, r); }}>
            {r.order_no || r.ref_order_no || '查看'}
          </Button>
        ) : <Text type="secondary">-</Text>,
    },
    { title: '时间', dataIndex: 'created_at', key: 'created_at', width: 170, valueType: 'dateTime' },
    {
      title: '操作', key: 'actions', width: 150, hideInSearch: true, fixed: 'right',
      render: (_, r) => (
        <Space size={4} onClick={(e) => e.stopPropagation()}>
          <Button
            type="link"
            size="small"
            disabled={r.is_read}
            loading={readLoadingId === r.id}
            onClick={() => handleMarkRead(r)}
          >已读</Button>
          <Button
            type="link"
            size="small"
            icon={<LinkOutlined />}
            disabled={!canProcess(r)}
            onClick={() => handleJumpToOrder(r.order_no || r.ref_order_no, r.ref_order_id, r)}
          >处理</Button>
        </Space>
      ),
    },
  ];

  const tabItems = ALL_TAB_KEYS
    .filter((key) => visibleTabKeys.includes(key))
    .map((key) => ({
      key,
      label: key === 'all'
        ? <Badge count={unreadByType.all || 0} size="small" offset={[6, -2]}>全部消息</Badge>
        : <Badge count={unreadByType[key] || 0} size="small" offset={[6, -2]}><Tag color={BIZ_COLOR[key]} style={{ margin: 0 }}>{BIZ_LABEL[key]}</Tag></Badge>,
    }));

  return (
    <PageContainer
      header={{
        title: '消息通知',
        extra: [
          <Badge key="total" count={unreadTotal}><BellOutlined style={{ fontSize: 16 }} /></Badge>,
        ],
      }}
    >
      <Space direction="vertical" size="small" style={{ width: '100%', marginBottom: 12 }}>
        <Space wrap align="center">
          <Text type="secondary">读状态</Text>
          <Segmented<ReadFilterKey>
            value={readFilter}
            onChange={(value) => { setReadFilter(value); actionRef.current?.reload(); }}
            options={[
              { label: '未读', value: 'unread' },
              { label: '已读', value: 'read' },
              { label: '全部', value: 'all' },
            ]}
          />
        </Space>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: -16 }}>
          <Tabs activeKey={activeTab} onChange={(key) => { setActiveTab(key as NotificationTabKey); actionRef.current?.reload(); }} items={tabItems} style={{ flex: 1, minWidth: 0 }} />
        </div>
      </Space>
      <ProTable<NotificationItem>
        actionRef={actionRef}
        columns={columns}
        request={async (params: PageParams) => {
          const bucket = TAB_BUCKET_MAP[activeTab];
          const result = await getNotifications({
            ...params,
            bucket,
            includeDispatch: true,
            ...readFilterParams(readFilter),
          });
          const rawList = result.list || [];
          const list = activeTab === 'withdraw_void' ? rawList.filter(isWithdrawVoidBucket) : rawList;
          return { data: list, success: true, total: activeTab === 'withdraw_void' ? list.length : (result.total ?? rawList.length) };
        }}
        rowKey="id"
        search={false}
        headerTitle="通知列表"
        pagination={{ defaultPageSize: 20, pageSizeOptions: ['20', '50', '100'], showSizeChanger: true }}
        scroll={{ x: 1280 }}
        dateFormatter="string"
        onRow={(record) => ({
          onClick: () => handleRowClick(record),
          style: { cursor: 'pointer' },
        })}
        options={{ reload: reloadList }}
      />

      <Modal
        title={detailItem ? getNotificationDisplayTitle(detailItem) : '通知详情'}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={[
          detailItem && !detailItem.is_read && (
            <Button key="read" loading={readLoadingId === detailItem.id} onClick={() => handleMarkRead(detailItem)}>
              已读
            </Button>
          ),
          detailItem && (
            <Button key="jump" type="primary" icon={<EyeOutlined />} disabled={!canProcess(detailItem)}
              onClick={() => handleJumpToOrder(detailItem.ref_order_no || detailItem.order_no, detailItem.ref_order_id, detailItem)}>
              处理关联工单
            </Button>
          ),
          <Button key="close" onClick={() => setDetailOpen(false)}>关闭</Button>,
        ]}
        width={660}
      >
        {detailItem && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="分类">
              {(() => {
                const bucket = classifyNotification(detailItem);
                return <Tag color={BIZ_COLOR[bucket]}>{BIZ_LABEL[bucket]}</Tag>;
              })()}
            </Descriptions.Item>
            <Descriptions.Item label="状态">{detailItem.is_read ? '已读' : '未读'}</Descriptions.Item>
            <Descriptions.Item label="优先级"><Tag color={PRI_COLOR[detailItem.priority]}>{PRI_LABEL[detailItem.priority] || detailItem.priority}</Tag></Descriptions.Item>
            <Descriptions.Item label="时间">{detailItem.created_at}</Descriptions.Item>
            <Descriptions.Item label="操作人">{getNotificationOperatorName(detailItem) || '系统'}</Descriptions.Item>
            <Descriptions.Item label="内容"><Paragraph>{getNotificationDisplayContent(detailItem)}</Paragraph></Descriptions.Item>
            {detailItem.diff_summary && (
              <Descriptions.Item label="变更摘要">
                <div style={{ padding: 8, background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 4, fontSize: 13 }}>
                  <Text strong style={{ fontSize: 12 }}>字段变更对比：</Text>
                  <Paragraph style={{ whiteSpace: 'pre-wrap', marginTop: 4, marginBottom: 0 }}>{detailItem.diff_summary}</Paragraph>
                </div>
              </Descriptions.Item>
            )}
            {detailItem.diff_fields && Array.isArray(detailItem.diff_fields) && (
              <Descriptions.Item label="变更字段">
                <Space wrap>
                  {detailItem.diff_fields.map((f: any) => {
                    const fieldCode = f.field_code || f.fieldCode;
                    const fieldLabel = getNotificationFieldLabel(f.field_name || f.fieldName || fieldCode) || '相关字段';
                    return (
                      <Tag key={fieldCode || fieldLabel} color="gold">
                        {fieldLabel}
                        {f.old_value !== undefined && `：${localizeNotificationInternalKeys(String(f.old_value))} → ${localizeNotificationInternalKeys(String(f.new_value ?? ''))}`}
                      </Tag>
                    );
                  })}
                </Space>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="关联工单">
              {detailItem.ref_order_no || detailItem.ref_order_id || detailItem.entity_id ? (
                <Button type="link" icon={<LinkOutlined />} size="small"
                  onClick={() => handleJumpToOrder(detailItem.ref_order_no || detailItem.order_no, detailItem.ref_order_id, detailItem)}>
                  {detailItem.ref_order_no || detailItem.order_no || detailItem.entity_id}
                </Button>
              ) : '-'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </PageContainer>
  );
};

export default NotificationsPage;
