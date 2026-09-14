import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, App, Button, Input, Select, Space, Table, Tag } from 'antd';
import { getAllCustomerRules, type CustomerRuleItem } from '@/services/customerRules';
import { getPortalIntakeWorkbench, type PortalIntakeWorkbenchRow } from '@/services/portalIntakeWorkbench';
import PortalIntakeReview from './PortalIntakeReview';

const statusLabels: Record<string, string> = { pending_review: '待审核', in_review: '审核中', needs_correction: '待客户补正', draft: '草稿', pending: '已派发待办理', processing: '办理中', completed: '已办结', missing: '受理缺失' };
const businessLabels = { onboarding: '增员', resignation: '减员' } as const;

type PortalIntakeWorkbenchProps = {
  initialCustomerId?: string;
};

export default function PortalIntakeWorkbench({ initialCustomerId }: PortalIntakeWorkbenchProps) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<CustomerRuleItem[]>([]);
  const [rows, setRows] = useState<PortalIntakeWorkbenchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState<{ customerId?: string; businessType?: 'onboarding' | 'resignation'; status?: string; search?: string; page: number; pageSize: number }>({ customerId: initialCustomerId, page: 1, pageSize: 20 });
  const [total, setTotal] = useState(0);
  const [reviewing, setReviewing] = useState<PortalIntakeWorkbenchRow | null>(null);
  const loadVersion = useRef(0);

  const load = async () => {
    const current = ++loadVersion.current;
    setLoading(true);
    try {
      const result = await getPortalIntakeWorkbench(query);
      if (current === loadVersion.current) { setRows(result.items); setTotal(result.total); }
    } catch (error) { if (current === loadVersion.current) message.error(error instanceof Error ? error.message : '审核列表加载失败'); }
    finally { if (current === loadVersion.current) setLoading(false); }
  };
  useEffect(() => { void getAllCustomerRules().then(setCustomers).catch(() => undefined); }, []);
  useEffect(() => { void load(); }, [query.customerId, query.businessType, query.status, query.search, query.page, query.pageSize]);
  useEffect(() => () => { loadVersion.current++; }, []);

  const closeReview = () => {
    setReviewing(null);
    void load();
  };

  return <Space direction="vertical" size="middle" style={{ width: '100%' }}>
    <Alert type="info" showIcon message="增减员门户审核工作台" description="按当前账号绑定的客户范围汇总门户受理草稿。资料由业务员在审核抽屉里直接核对并修改，提交或 Excel 导入不会自动派发，审核通过后继续沿用现有工单规则派发。" />
    <Space wrap>
      <Select allowClear showSearch optionFilterProp="label" style={{ width: 260 }} placeholder="全部客户" value={query.customerId} options={customers.map((item) => ({ value: item.customerId, label: `${item.customerName}（${item.customerCode}）` }))} onChange={(value) => setQuery((old) => ({ ...old, customerId: value, page: 1 }))} />
      <Select allowClear style={{ width: 130 }} placeholder="全部业务" value={query.businessType} options={[{ value: 'onboarding', label: '增员' }, { value: 'resignation', label: '减员' }]} onChange={(value) => setQuery((old) => ({ ...old, businessType: value, page: 1 }))} />
      <Select allowClear style={{ width: 150 }} placeholder="全部状态" value={query.status} options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))} onChange={(value) => setQuery((old) => ({ ...old, status: value, page: 1 }))} />
      <Input.Search allowClear placeholder="工单号、客户、员工或证件号" style={{ width: 280 }} onSearch={(value) => setQuery((old) => ({ ...old, search: value || undefined, page: 1 }))} />
      <Button onClick={() => void load()}>刷新</Button>
    </Space>
    <Table<PortalIntakeWorkbenchRow>
      rowKey="id" loading={loading} dataSource={rows}
      pagination={{ current: query.page, pageSize: query.pageSize, total, showSizeChanger: true, onChange: (page, pageSize) => setQuery((old) => ({ ...old, page, pageSize })) }}
      columns={[
        { title: '受理编号', dataIndex: 'requestNo', width: 150 },
        { title: '客户', render: (_, row) => <span>{row.customerName || '-'}<br /><small>{row.customerCode || row.customerId}</small></span> },
        { title: '业务', render: (_, row) => businessLabels[row.businessType] },
        { title: '员工', render: (_, row) => <span>{row.employeeName || '-'}<br /><small>{row.employeeIdCard || ''}</small></span> },
        { title: '状态', render: (_, row) => <Tag color={row.reviewStatus === 'needs_correction' ? 'orange' : row.reviewStatus === 'completed' ? 'green' : 'blue'}>{statusLabels[row.reviewStatus] ?? row.reviewStatus}</Tag> },
        { title: '待补配置', render: (_, row) => row.configurationMissing.length ? <Tag color="orange">{row.configurationMissing.join('、')}</Tag> : '已配置' },
        { title: '提交时间', dataIndex: 'createdAt', render: (value: string) => value ? new Date(value).toLocaleString() : '-' },
        { title: '操作', fixed: 'right', width: 220, render: (_, row) => <Space wrap>
          {(row.canClaim || row.canReview) ? <Button size="small" onClick={() => setReviewing(row)}>{row.canReview ? '继续审核' : '审核'}</Button> : <Tag>只读</Tag>}
          {row.workOrderId && <Button size="small" onClick={() => navigate(`/work-orders/${row.workOrderId}`)}>工单详情</Button>}
        </Space> },
      ]}
    />
    {reviewing && <PortalIntakeReview
      key={`${reviewing.customerId}:${reviewing.id}`}
      customerId={reviewing.customerId}
      autoOpenSubmissionId={reviewing.id}
      submission={reviewing}
      compact
      onClosed={closeReview}
      onCompleted={closeReview}
    />}
  </Space>;
}


