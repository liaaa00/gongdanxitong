import { useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Button, DatePicker, Space, Tag } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { getDispatchedOrders } from '@/services/dispatchedOrders';
import type { DispatchedOrderItem } from '@/services/dispatchedOrders';
import type { PageParams } from '@/services/mock';
import { getModuleLabel } from '@/constants/modules';
import { getStatusColor, getStatusText } from '@/constants/dictionaries';
import { useRef } from 'react';

const HISTORY_STATUSES = new Set(['completed', 'returned', 'withdrawn', 'void']);

const PRIORITY_OPTIONS = [
  { label: '紧急', value: 'urgent', color: 'red' },
  { label: '普通', value: 'normal', color: 'blue' },
];

const WORK_TYPE_OPTIONS = [
  { label: '数据录入子工单', value: 'data_entry' },
  { label: '社保公积金办理子工单', value: 'social_insurance' },
  { label: '入职联系子工单', value: 'onboarding_contact' },
  { label: '劳动合同签订子工单', value: 'contract' },
  { label: '续签合同子工单', value: 'renewal_contract' },
  { label: '离职联系子工单', value: 'resignation_contact' },
  { label: '离职证明子工单', value: 'resignation_cert' },
  { label: '待遇申报子工单', value: 'benefit_apply' },
];

function getPriorityMeta(priority?: string | null) {
  return PRIORITY_OPTIONS.find((item) => item.value === priority) || PRIORITY_OPTIONS[1];
}

const HistoryWorkOrders: React.FC = () => {
  const navigate = useNavigate();
  const actionRef = useRef<ActionType>();
  const [month, setMonth] = useState<Dayjs | null>(dayjs());

  const columns = useMemo<ProColumns<DispatchedOrderItem>[]>(() => [
    { title: '工单编号', dataIndex: 'order_no', width: 160, copyable: true },
    {
      title: '子工单类型',
      dataIndex: 'moduleCode',
      width: 170,
      valueType: 'select',
      fieldProps: { options: WORK_TYPE_OPTIONS, placeholder: '按模块筛选' },
      render: (_, row) => <Tag>{getModuleLabel(row.module_code)}</Tag>,
    },
    { title: '员工姓名', dataIndex: 'employee_name', width: 110 },
    { title: '员工证件号', dataIndex: 'employee_id_card', width: 170, ellipsis: true },
    { title: '客户代码', dataIndex: 'customer_code', width: 120 },
    { title: '客户名称', dataIndex: 'customer_name', width: 160, ellipsis: true },
    { title: '状态', dataIndex: 'status', width: 110, render: (_, row) => <Tag color={getStatusColor(row.void_at ? 'void' : row.status)}>{getStatusText(row.void_at ? 'void' : row.status)}</Tag> },
    {
      title: '优先级', dataIndex: 'priority', width: 90, valueType: 'select',
      fieldProps: { options: PRIORITY_OPTIONS.map(({ label, value }) => ({ label, value })) },
      render: (_, row) => {
        const priority = getPriorityMeta(row.priority);
        return <Tag color={priority.color}>{priority.label}</Tag>;
      },
    },
    { title: '派发时间', dataIndex: 'dispatched_at', valueType: 'dateTime', width: 170 },
    { title: '完成时间', dataIndex: 'completed_at', valueType: 'dateTime', width: 170 },
    {
      title: '操作', valueType: 'option', width: 90,
      render: (_, row) => <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/my-dispatched/${row.id}`)}>详情</Button>,
    },
  ], [navigate]);

  return (
    <PageContainer
      header={{
        title: '历史工单',
        subTitle: '默认显示所选月份已完成、已退回、已撤回、已作废的子工单',
        extra: [
          <Space key="month">
            <span>工单月份：</span>
            <DatePicker
              picker="month"
              allowClear={false}
              value={month}
              onChange={(value) => { setMonth(value || dayjs()); actionRef.current?.reload(); }}
            />
          </Space>,
        ],
      }}
    >
      <ProTable<DispatchedOrderItem>
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        search={{ labelWidth: 'auto' }}
        options={false}
        pagination={{ defaultPageSize: 20, pageSizeOptions: ['20', '50', '100'], showSizeChanger: true }}
        dateFormatter="string"
        request={async (params: PageParams & Record<string, unknown>) => {
          const moduleValue = params.moduleCode || params.module_code;
          const result = await getDispatchedOrders({
            ...params,
            moduleCode: moduleValue ? String(moduleValue) : undefined,
            pageSize: Math.min(Number(params.pageSize || 20), 100),
            includeReturned: true,
            orderMonth: (month || dayjs()).format('YYYY-MM'),
          });
          const list = result.list.filter((row) => HISTORY_STATUSES.has(row.status) || Boolean(row.void_at));
          return { data: list, success: true, total: list.length };
        }}
      />
    </PageContainer>
  );
};

export default HistoryWorkOrders;
