import { useRef, useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import type { ProColumns, ActionType } from '@ant-design/pro-components';
import { ProTable } from '@ant-design/pro-components';
import { Tag, Button, Space, App, Badge, Tabs, Popconfirm, Modal, Descriptions, Typography, Segmented, Tooltip } from 'antd';
import { BellOutlined, DeleteOutlined, CheckOutlined, EyeOutlined, LinkOutlined } from '@ant-design/icons';
import { getNotifications, markNotificationRead, markAllRead, markNotificationsReadByQuery, deleteNotification, getUnreadCountByBucket } from '@/services/notifications';
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

// 业务员修改公共字段后，通知后道处理人查看/办理。
const CREATOR_CHANGED_TYPES = [
  'order.field_changed', 'order_field_changed', 'order.completed_modified', 'order_completed_modified',
  'creator_modified', 'modified_by_creator', 'field_changed_by_creator', 'initiator_modified',
];
// 后道补充/修改字段后，通知业务员查看。
const BACKEND_CHANGED_TYPES = [
  'order.supplement_filled', 'order_supplement_filled', 'field_supplement', 'field_supplemented',
  'backend_supplemented', 'supplement_filled', 'order_field_supplemented',
];
const RETURNED_TYPES = ['returned', 'return', 'task_returned', 'sub_order_returned', 'dispatched_returned', 'dispatched_returned_to_salesperson'];
const URGE_TYPES = ['urge', 'urge_received', 'urge_work_order', 'reminder'];
const URGE_FEEDBACK_TYPES = ['urge_feedback', 'urge_replied', 'urge_result'];
const SLA_WARNING_TYPES = ['sla_warning', 'sla_warn', 'timeout_warning'];
const SLA_BREACHED_TYPES = ['sla_breach', 'sla_breached', 'timeout_breached', 'overdue'];
const WITHDRAW_REQUEST_TYPES = ['withdraw_request', 'creator_withdraw', 'initiator_withdraw', 'work_order_withdraw'];
const VOID_REQUEST_TYPES = ['void_request', 'creator_void', 'initiator_void', 'work_order_void'];
const WITHDRAW_VOID_RESULT_TYPES = ['withdraw_approved', 'withdraw_rejected', 'void_approved', 'void_rejected', 'withdraw_void_result'];
const SYSTEM_TYPES = ['system', 'system_announcement'];

// Tab → bucket 映射（与后端 toNotificationBucket 口径一致，确保 Badge 和列表数据对齐）
const TAB_BUCKET_MAP: Record<NotificationTabKey, string | undefined> = {
  all: undefined,
  // “业务员数据修改”展示业务员改字段后通知后道的 creator_modified bucket。
  salesperson_field_changed: 'creator_modified',
  salesperson_returned: 'returned',
  salesperson_urge_feedback: 'urge_feedback',
  salesperson_withdraw_void_result: 'withdraw_void_result',
  // “后道数据修改”展示后道补充/接单/完成后反馈业务员的 field_changed bucket。
  backend_creator_modified: 'field_changed',
  backend_urge: 'urge',
  backend_sla_warning: 'sla_warning',
  backend_sla_breached: 'sla_breached',
  backend_withdraw_void_request: 'withdraw_void_request',
  system: 'system',
};

const TAB_TYPE_MAP: Record<NotificationTabKey, string[]> = {
  all: [],
  salesperson_field_changed: CREATOR_CHANGED_TYPES,
  salesperson_returned: RETURNED_TYPES,
  salesperson_urge_feedback: URGE_FEEDBACK_TYPES,
  salesperson_withdraw_void_result: WITHDRAW_VOID_RESULT_TYPES,
  backend_creator_modified: BACKEND_CHANGED_TYPES,
  backend_urge: URGE_TYPES,
  backend_sla_warning: SLA_WARNING_TYPES,
  backend_sla_breached: SLA_BREACHED_TYPES,
  backend_withdraw_void_request: [...WITHDRAW_REQUEST_TYPES, ...VOID_REQUEST_TYPES],
  system: SYSTEM_TYPES,
};

const SALESPERSON_TAB_KEYS: NotificationTabKey[] = [
  'all',
  'backend_creator_modified',
  'salesperson_returned',
  'salesperson_urge_feedback',
  'salesperson_withdraw_void_result',
  'system',
];
const BACKEND_TAB_KEYS: NotificationTabKey[] = [
  'all',
  'salesperson_field_changed',
  'backend_urge',
  'backend_sla_warning',
  'backend_sla_breached',
  'backend_withdraw_void_request',
  'system',
];
const ALL_TAB_KEYS: NotificationTabKey[] = Array.from(new Set([...SALESPERSON_TAB_KEYS, ...BACKEND_TAB_KEYS]));

const BACKEND_ROLES = [
  ROLE.DATA_ENTRY_LEADER,
  ROLE.SHARED_TEAM_OWNER,
  ROLE.LABOR_CONTRACT_MEMBER,
  ROLE.ONBOARDING_RESIGNATION_MEMBER,
  ROLE.SOCIAL_INSURANCE_SPECIALIST,
];

const BUSINESS_ROLES = [ROLE.BUSINESS_OWNER, ROLE.BUSINESS_GROUP_LEADER, ROLE.BUSINESS_GROUP_MEMBER];

const BIZ_COLOR: Record<NotificationTabKey | string, string> = {
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

const BIZ_LABEL: Record<NotificationTabKey | string, string> = {
  all: '全部消息',
  salesperson_field_changed: '业务员数据修改',
  salesperson_returned: '退回',
  salesperson_urge_feedback: '催办反馈',
  salesperson_withdraw_void_result: '撤回/作废结果',
  backend_creator_modified: '后道数据修改',
  backend_urge: '催办',
  backend_sla_warning: '即将超时',
  backend_sla_breached: '已超时',
  backend_withdraw_void_request: '撤回/作废申请',
  system: '系统',
};

const PRI_COLOR: Record<string, string> = { urgent: 'red', normal: 'blue', low: 'default', high: 'red' };
const PRI_LABEL: Record<string, string> = { urgent: '紧急', high: '高', normal: '普通', low: '低' };

function rawNotificationText(item: Pick<NotificationItem, 'biz_type' | 'type' | 'title' | 'content'>): string {
  return `${item.biz_type || ''} ${item.type || ''} ${item.title || ''} ${item.content || ''}`.toLowerCase().replace(/[.:]/g, '_');
}

function matchesTypes(item: Pick<NotificationItem, 'biz_type' | 'type' | 'title' | 'content'>, types: string[]): boolean {
  const raw = rawNotificationText(item);
  return types.some((type) => raw.includes(type.replace(/[.:]/g, '_')));
}

function classifyNotification(item: Pick<NotificationItem, 'biz_type' | 'type' | 'title' | 'content'>): NotificationTabKey {
  const raw = rawNotificationText(item);
  if (matchesTypes(item, SYSTEM_TYPES)) return 'system';
  if (matchesTypes(item, WITHDRAW_VOID_RESULT_TYPES)) return 'salesperson_withdraw_void_result';
  if (matchesTypes(item, [...WITHDRAW_REQUEST_TYPES, ...VOID_REQUEST_TYPES]) || raw.includes('撤回') || raw.includes('作废')) return 'backend_withdraw_void_request';
  if (matchesTypes(item, SLA_BREACHED_TYPES) || raw.includes('已超时') || raw.includes('超期')) return 'backend_sla_breached';
  if (matchesTypes(item, SLA_WARNING_TYPES) || raw.includes('即将超时') || raw.includes('预警')) return 'backend_sla_warning';
  if (matchesTypes(item, URGE_FEEDBACK_TYPES)) return 'salesperson_urge_feedback';
  if (matchesTypes(item, URGE_TYPES) || raw.includes('催办')) return 'backend_urge';
  if (matchesTypes(item, BACKEND_CHANGED_TYPES) || raw.includes('补充')) return 'backend_creator_modified';
  if (matchesTypes(item, RETURNED_TYPES) || raw.includes('退回')) return 'salesperson_returned';
  if (matchesTypes(item, CREATOR_CHANGED_TYPES) || raw.includes('修改')) return 'salesperson_field_changed';
  return 'system';
}

function getQueryBizType(tabKey: NotificationTabKey, visibleTabKeys: NotificationTabKey[]): string | undefined {
  // 「全部消息」不按 biz_type 过滤，让后端返回所有通知（含派发类）。
  if (tabKey === 'all') return undefined;
  const types = (TAB_TYPE_MAP[tabKey] || []);
  return types.length ? Array.from(new Set(types)).join(',') : undefined;
}

function normalizeJumpLink(link: string, notificationId: string): string {
  const normalized = link.replace(/^\/dispatched\//, '/my-dispatched/');
  return `${normalized}${normalized.includes('?') ? '&' : '?'}fromNotification=${notificationId}`;
}

function canProcess(item: NotificationItem): boolean {
  return Boolean(item.entity_id || item.ref_order_id || item.ref_order_no || item.order_no || item.link);
}

const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { hasRole, hasAnyRole } = useAuth();
  const actionRef = useRef<ActionType>();
  const [activeTab, setActiveTab] = useState<NotificationTabKey>('all');
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [unreadByType, setUnreadByType] = useState<Record<string, number>>({});
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<NotificationItem | null>(null);

  const visibleTabKeys = useMemo<NotificationTabKey[]>(() => {
    if (hasRole(ROLE.ADMIN)) return ALL_TAB_KEYS;
    const isBusiness = hasAnyRole(BUSINESS_ROLES);
    const isBackend = hasAnyRole(BACKEND_ROLES);
    if (isBusiness && !isBackend) return SALESPERSON_TAB_KEYS;
    if (isBackend && !isBusiness) return BACKEND_TAB_KEYS;
    if (isBusiness) return SALESPERSON_TAB_KEYS;
    return BACKEND_TAB_KEYS;
  }, [hasAnyRole, hasRole]);

  useEffect(() => {
    if (!visibleTabKeys.includes(activeTab)) setActiveTab('all');
  }, [activeTab, visibleTabKeys]);

  const refreshCounts = async () => {
    try {
      const counts = await getUnreadCountByBucket();
      const next: Record<string, number> = {
        salesperson_field_changed: counts.backend.creator_modified || 0,
        salesperson_returned: counts.salesperson.returned || 0,
        salesperson_urge_feedback: counts.salesperson.urge_feedback || 0,
        salesperson_withdraw_void_result: counts.salesperson.withdraw_void_result || 0,
        backend_creator_modified: counts.salesperson.field_changed || 0,
        backend_urge: counts.backend.urge || 0,
        backend_sla_warning: counts.backend.sla_warning || 0,
        backend_sla_breached: counts.backend.sla_breached || 0,
        backend_withdraw_void_request: counts.backend.withdraw_void_request || 0,
        system: counts.system || 0,
      };
      next.all = visibleTabKeys.filter((key) => key !== 'all').reduce((sum, key) => sum + (next[key] || 0), 0);
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

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      message.success('已标记为已读');
    } catch {
      message.error('标记已读失败');
    }
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
    try {
      await markAllRead();
      message.success('已全部标记为已读');
    } catch {
      message.error('标记失败');
    }
    refreshCounts();
    actionRef.current?.reload();
  };

  const handleMarkCurrentCategoryRead = async () => {
    try {
      const bucket = TAB_BUCKET_MAP[activeTab];
      const result = await markNotificationsReadByQuery({
        bucket,
      }) as { affected?: number } | void;
      const affected = result && typeof result.affected === 'number' ? result.affected : 0;
      message.success(activeTab === 'all' ? '已将当前可见消息标为已读' : `已将当前分类 ${affected} 条未读消息标为已读`);
    } catch {
      message.error('标记当前分类失败');
    }
    refreshCounts();
    actionRef.current?.reload();
  };

  const handleRowClick = (record: NotificationItem) => {
    setDetailItem(record);
    setDetailOpen(true);
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
      title: '分类', dataIndex: 'biz_type', key: 'biz_type', width: 130,
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
      title: '内容', dataIndex: 'content', key: 'content', width: 360, ellipsis: true,
      render: (_dom: unknown, r: NotificationItem) => {
        const displayContent = getNotificationDisplayContent(r);
        return (
          <Space size={4}>
            {!r.is_read && <Badge status="processing" />}
            <Tooltip title={displayContent}>
              <Text ellipsis style={{ maxWidth: 320 }}>
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
      title: '操作', key: 'actions', width: 180, hideInSearch: true, fixed: 'right',
      render: (_, r) => (
        <Space size={4}>
          {!r.is_read && (
            <Button type="link" size="small" icon={<CheckOutlined />} onClick={(e) => { e.stopPropagation(); handleMarkRead(r.id); }}>已读</Button>
          )}
          <Button
            type="link"
            size="small"
            icon={<LinkOutlined />}
            disabled={!canProcess(r)}
            onClick={(e) => { e.stopPropagation(); handleJumpToOrder(r.order_no || r.ref_order_no, r.ref_order_id, r); }}
          >处理</Button>
          <Popconfirm title="确定删除？" onConfirm={(e) => { e?.stopPropagation(); handleDelete(r.id); }}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const allTabItems: Array<{ key: NotificationTabKey; label: React.ReactNode }> = ALL_TAB_KEYS.map((key) => ({
    key,
    label: key === 'all'
      ? <Badge count={unreadByType.all || 0} size="small" offset={[6, -2]}>全部消息</Badge>
      : <Badge count={unreadByType[key] || 0} size="small" offset={[6, -2]}><Tag color={BIZ_COLOR[key]} style={{ margin: 0 }}>{BIZ_LABEL[key]}</Tag></Badge>,
  }));
  const tabItems = allTabItems.filter((item) => visibleTabKeys.includes(item.key));

  return (
    <PageContainer
      header={{
        title: '消息通知',
        subTitle: '红点只有在点击“已读”后才会消失；“处理”只负责跳转到关联工单。',
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
            // 特定 Tab 用 bucket 过滤（与 countUnreadByBucket 口径一致）
            bucket,
            includeDispatch: activeTab === 'all' ? true : undefined,
            unread: readFilter === 'unread' ? true : undefined,
            isRead: readFilter === 'read' ? true : undefined,
          });
          return { data: result.list || [], success: true, total: result.total ?? (result.list || []).length };
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
        options={{ reload: () => { refreshCounts(); actionRef.current?.reload(); } }}
      />

      <Modal
        title={detailItem ? getNotificationDisplayTitle(detailItem) : '通知详情'}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={[
          detailItem && !detailItem.is_read && (
            <Button key="read" icon={<CheckOutlined />} onClick={() => handleMarkRead(detailItem.id)}>标记已读</Button>
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
