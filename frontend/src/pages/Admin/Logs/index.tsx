import { useEffect, useMemo, useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { ProTable } from '@ant-design/pro-components';
import { Button, Modal, Tag, Space, Tabs, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EyeOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import { getOperationLogs } from '@/services/operationLogs';
import type { OperationLogDiffItem, OperationLogItem, OperationLogQuery } from '@/services/operationLogs';
import { getUsers } from '@/services/users';
import type { UserItem } from '@/services/users';
import type { PageParams } from '@/services/mock';

const ACTION_COLOR: Record<string, string> = {
  create: 'green', submit: 'blue', dispatch: 'geekblue', accept: 'cyan',
  complete: 'green', return: 'orange', supplement: 'purple', withdraw: 'red',
};

const ACTION_LABEL: Record<string, string> = {
  create: '创建',
  submit: '提交',
  dispatch: '派发',
  accept: '接单',
  complete: '完成',
  return: '退回',
  supplement: '补件',
  withdraw: '撤回',
};

const ENTITY_LABEL: Record<string, string> = {
  work_order: '主工单',
  dispatched_order: '子工单',
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const clampPageSize = (value: unknown) => {
  const pageSize = Number(value ?? DEFAULT_PAGE_SIZE);
  if (!Number.isFinite(pageSize) || pageSize <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(pageSize), MAX_PAGE_SIZE);
};

const getActionCode = (record: OperationLogItem) => record.actionCode || record.action_type || '';
const getActionLabel = (record: OperationLogItem) => record.actionLabel || ACTION_LABEL[getActionCode(record)] || getActionCode(record) || '-';
const getEntityType = (record: OperationLogItem) => record.entityType || record.entity_type || '';
const getEntityLabel = (record: OperationLogItem) => record.entityLabel || ENTITY_LABEL[getEntityType(record)] || getEntityType(record) || '-';
const getOperatorId = (record: OperationLogItem) => record.operatorId || record.userId || record.user_id || '';
const getOperatorName = (record: OperationLogItem) => record.operatorName || record.userName || record.user_name || (getOperatorId(record) ? `用户 #${getOperatorId(record)}` : '-');
const getCreatedAt = (record: OperationLogItem) => record.createdAt || record.created_at || '';

const renderValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const diffColumns: ColumnsType<OperationLogDiffItem> = [
  {
    title: '字段中文名',
    dataIndex: 'fieldLabel',
    key: 'fieldLabel',
    width: 160,
    render: (_, record) => record.fieldLabel || record.field || '-',
  },
  {
    title: '变更前',
    dataIndex: 'before',
    key: 'before',
    render: renderValue,
  },
  {
    title: '变更后',
    dataIndex: 'after',
    key: 'after',
    render: renderValue,
  },
];

const renderDiffTable = (diffs?: OperationLogDiffItem[]) => {
  if (!diffs || diffs.length === 0) return null;
  return (
    <Table<OperationLogDiffItem>
      size="small"
      rowKey={(record) => record.field}
      columns={diffColumns}
      dataSource={diffs}
      pagination={false}
    />
  );
};

const AdminLogs: React.FC = () => {
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<OperationLogItem | null>(null);
  const [userOptions, setUserOptions] = useState<{ label: string; value: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    getUsers({ page: 1, pageSize: MAX_PAGE_SIZE })
      .then((result) => {
        if (cancelled) return;
        setUserOptions(result.list.map((user: UserItem) => ({
          value: user.id,
          label: user.real_name || user.username || user.id,
        })));
      })
      .catch(() => {
        if (!cancelled) setUserOptions([]);
      });
    return () => { cancelled = true; };
  }, []);

  const actionOptions = useMemo(() => Object.entries(ACTION_LABEL).map(([value, label]) => ({ label, value })), []);

  const columns: ProColumns<OperationLogItem>[] = [
    { title: '日志编号', dataIndex: 'id', key: 'id', width: 100, hideInSearch: true },
    {
      title: '动作类型', dataIndex: 'actionCodes', key: 'actionCodes', width: 120,
      valueType: 'select',
      fieldProps: { mode: 'multiple', options: actionOptions, placeholder: '请选择动作类型' },
      render: (_, r) => <Tag color={ACTION_COLOR[getActionCode(r)] || 'default'}>{getActionLabel(r)}</Tag>,
    },
    {
      title: '实体类型', dataIndex: 'entityType', key: 'entityType', width: 110, hideInSearch: true,
      renderText: (_, record) => getEntityLabel(record),
    },
    { title: '业务记录编号', dataIndex: 'entityId', key: 'entityId', width: 120, hideInSearch: true, renderText: (_, record) => record.entityId || record.entity_id || '-' },
    {
      title: '操作人', dataIndex: 'operatorIds', key: 'operatorIds', width: 120,
      valueType: 'select',
      fieldProps: { mode: 'multiple', options: userOptions, showSearch: true, optionFilterProp: 'label', placeholder: '请选择操作人' },
      renderText: (_, record) => getOperatorName(record),
    },
    { title: '访问地址', dataIndex: 'ip_address', key: 'ip_address', width: 130, hideInSearch: true, renderText: (_, record) => record.ip_address || '-' },
    {
      title: '时间范围', dataIndex: 'timeRange', key: 'timeRange', hideInTable: true,
      valueType: 'dateTimeRange',
      search: { transform: (value: [string, string]) => ({ startTime: value?.[0], endTime: value?.[1] }) },
    },
    { title: '时间', dataIndex: 'createdAt', key: 'createdAt', width: 180, valueType: 'dateTime', sorter: true, hideInSearch: true, renderText: (_, record) => getCreatedAt(record) || '-' },
    {
      title: '变更内容', dataIndex: 'diffs', key: 'diffs', width: 260, hideInSearch: true,
      render: (_, record) => renderDiffTable(record.diffs) || <span style={{ color: '#999' }}>-</span>,
    },
    {
      title: '操作', key: 'actions', width: 80, hideInSearch: true,
      render: (_, r) => (
        <Button type="link" size="small" icon={<EyeOutlined />}
          onClick={() => { setDetailItem(r); setDetailOpen(true); }}>详情</Button>
      ),
    },
  ];

  return (
    <PageContainer header={{ title: '操作日志' }}>
      <ProTable<OperationLogItem>
        columns={columns}
        request={async (params: PageParams & OperationLogQuery & { current?: number; timeRange?: [Dayjs, Dayjs] }) => {
          const requestParams: OperationLogQuery = {
            page: params.current || params.page || 1,
            pageSize: clampPageSize(params.pageSize),
          };
          if (params.actionCodes?.length) requestParams.actionCodes = params.actionCodes;
          if (params.operatorIds?.length) requestParams.operatorIds = params.operatorIds;
          if (params.startTime) requestParams.startTime = params.startTime;
          if (params.endTime) requestParams.endTime = params.endTime;

          const result = await getOperationLogs(requestParams);
          return { data: result.list, success: result.success !== false, total: result.total };
        }}
        rowKey="id"
        search={{ labelWidth: 'auto' }}
        headerTitle="操作日志查询"
        pagination={{ defaultPageSize: DEFAULT_PAGE_SIZE, pageSizeOptions: ['20', '50', '100'], showSizeChanger: true }}
        dateFormatter="string"
      />

      <Modal title="日志详情" open={detailOpen} onCancel={() => setDetailOpen(false)}
        footer={null} width={900}>
        {detailItem && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Space wrap>
              <Tag color={ACTION_COLOR[getActionCode(detailItem)] || 'default'}>{getEntityLabel(detailItem)}{getActionLabel(detailItem)}</Tag>
              <span>操作人：{getOperatorName(detailItem)}</span>
              <span>时间：{getCreatedAt(detailItem) || '-'}</span>
            </Space>
            {renderDiffTable(detailItem.diffs)}
            <Tabs items={[
              {
                key: 'before', label: '变更前原始数据',
                children: detailItem.before_data
                  ? <pre style={{ fontSize: 12, maxHeight: 400, overflow: 'auto', background: '#f5f5f5', padding: 12 }}>{JSON.stringify(detailItem.before_data, null, 2)}</pre>
                  : <span style={{ color: '#999' }}>（新建，无历史数据）</span>,
              },
              {
                key: 'after', label: '变更后原始数据',
                children: detailItem.after_data
                  ? <pre style={{ fontSize: 12, maxHeight: 400, overflow: 'auto', background: '#f5f5f5', padding: 12 }}>{JSON.stringify(detailItem.after_data, null, 2)}</pre>
                  : <span style={{ color: '#999' }}>（无数据）</span>,
              },
            ]} />
          </Space>
        )}
      </Modal>
    </PageContainer>
  );
};

export default AdminLogs;
