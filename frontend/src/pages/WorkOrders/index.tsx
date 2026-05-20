import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { Button, Tag, Space, Badge, App, Tooltip, Popconfirm, Alert, Form, Input, Select, Modal, message as antMessage } from 'antd';
import {
  EyeOutlined,
  ExportOutlined,
  PlusOutlined,
  ImportOutlined,
  EditOutlined,
  RollbackOutlined,
  StopOutlined,
  BellOutlined,
} from '@ant-design/icons';
import MultiViewTable from '@/components/MultiViewTable';
import { getWorkOrders, deleteWorkOrder, batchDeleteWorkOrders, updateWorkOrder, submitWorkOrder } from '@/services/workOrders';
import type { WorkOrderItem } from '@/services/workOrders';
import type { PageParams } from '@/services/mock';
import { useAuth } from '@/hooks/useAuth';
import request from '@/services/request';
import { STATUS_MAP } from '@/constants/dictionaries';

const RefButton = forwardRef<HTMLButtonElement, React.ComponentProps<typeof Button>>((props, ref) => (
  <Button ref={ref} {...props} />
));
RefButton.displayName = 'RefButton';


const MODULE_LABEL: Record<string, string> = {
  contract: '劳动合同签订',
  onboarding_contact: '入职联系',
  data_entry: '数据录入',
  social_insurance: '社保公积金办理',
  renewal_contract: '续签合同',
  resignation_contact: '离职联系',
  resignation_cert: '离职证明',
  benefit_apply: '待遇申报',
};

const WorkOrders: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { hasRole, user } = useAuth();
  const [searchForm] = Form.useForm();
  const debounceRef = useRef<number>();
  const [quickFilters, setQuickFilters] = useState<Record<string, string>>({});
  const [tableVersion, setTableVersion] = useState(0);

  const isAdmin = hasRole('admin');
  const isBusinessOwner = hasRole('business_owner');
  const isGroupLeader = hasRole('business_group_leader');
  const isGroupMember = hasRole('business_group_member');
  // 业务员（发起人）：可修改/撤回/作废/催办
  const isBusinessUser = isGroupMember || isGroupLeader;
  // 只有管理员可以删除
  const canDelete = isAdmin;
  const isReadonlyViewer = isBusinessOwner && !isAdmin;

  const viewDescription = (() => {
    if (isAdmin) return { title: '管理员视角', desc: '查看全部工单数据', color: 'gold' };
    if (isBusinessOwner) return { title: '业务负责人视角', desc: '查看业务团队全部工单（只读）', color: 'purple' };
    if (isGroupLeader) return { title: '业务组长视角', desc: `查看「${user?.roles?.[0]?.name || '本组'}」工单`, color: 'blue' };
    if (isGroupMember) return { title: '业务员视角', desc: '仅查看自己发起的工单', color: 'default' };
    return { title: '共享团队视角', desc: '查看派发给你的工单', color: 'green' };
  })();

  const handleDelete = async (id: string) => {
    try {
      await deleteWorkOrder(id);
      message.success('已删除');
      setTableVersion((v) => v + 1);
    } catch {
      message.error('删除失败');
    }
  };

  const handleBatchDelete = async (ids: React.Key[], clear: () => void) => {
    try {
      const res = await batchDeleteWorkOrders(ids.map(String));
      message.success(`已删除 ${res.deleted} 条`);
      clear();
      setTableVersion((v) => v + 1);
    } catch {
      message.error('批量删除失败');
    }
  };

  const handleBatchExport = () => {
    message.info('批量导出功能开发中');
  };

  // 催办：发送催办通知给后道办理人员
  const handleUrge = async (record: WorkOrderItem) => {
    try {
      await request.post(`/work-orders/${record.id}/urge`, {});
      message.success(`已催办工单 ${record.order_no}`);
    } catch {
      message.error('催办失败');
    }
  };

  // 撤回申请
  const handleWithdraw = async (record: WorkOrderItem) => {
    try {
      await request.post(`/work-orders/${record.id}/withdraw`, {});
      message.success('撤回申请已提交，等待后道审核');
      setTableVersion((v) => v + 1);
    } catch {
      message.error('撤回申请失败');
    }
  };

  // 作废
  const handleVoid = async (record: WorkOrderItem) => {
    try {
      await request.post(`/work-orders/${record.id}/void`, {});
      message.success('作废申请已提交');
      setTableVersion((v) => v + 1);
    } catch {
      message.error('作废失败');
    }
  };

  const applyQuickFilters = () => {
    const values = searchForm.getFieldsValue();
    const next = Object.fromEntries(
      Object.entries(values).filter(([, value]) => String(value ?? '').trim()).map(([key, value]) => [key, String(value).trim()]),
    );
    setQuickFilters(next);
    setTableVersion((v) => v + 1);
  };

  const handleQuickFilterChange = () => {
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(applyQuickFilters, 200);
  };

  const resetQuickFilters = () => {
    searchForm.resetFields();
    setQuickFilters({});
    setTableVersion((v) => v + 1);
  };

  useEffect(() => () => window.clearTimeout(debounceRef.current), []);

  const columns: ProColumns<WorkOrderItem>[] = useMemo(
    () => [
      {
        title: '工单编号',
        dataIndex: 'order_no',
        key: 'order_no',
        width: 160,
        copyable: true,
      },
      {
        title: '员工姓名',
        dataIndex: 'employee_name',
        key: 'employee_name',
        width: 100,
      },
      {
        title: '证件号',
        dataIndex: 'employee_id_card',
        key: 'employee_id_card',
        width: 160,
      },
      {
        title: '客户',
        dataIndex: 'customer_name',
        key: 'customer_name',
        width: 120,
      },
      {
        title: '发起人',
        dataIndex: 'created_by',
        key: 'created_by',
        width: 100,
        hidden: !(isBusinessOwner || isGroupLeader || isAdmin),
        render: (_, record) => record.created_by || '—',
      },
      {
        title: '订单类型',
        dataIndex: 'order_type',
        key: 'order_type',
        width: 100,
        valueEnum: { onboarding: '入职', renewal: '续签', resignation: '离职' },
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 90,
        render: (_, record) => {
          const s = STATUS_MAP[record.status] || { color: 'default', label: '未知状态' };
          return <Tag color={s.color}>{s.label}</Tag>;
        },
      },
      {
        title: '子工单进度',
        key: 'dispatched_status',
        width: 220,
        hideInSearch: true,
        render: (_, record) => {
          const children = record.dispatched_orders;
          if (!children || children.length === 0) return <Tag>未派发</Tag>;
          return (
            <Space size={[4, 4]} wrap>
              {children.map((d) => {
                const modLabel = MODULE_LABEL[d.module_code] || '未知子工单';
                const color =
                  d.status === 'completed' ? 'success'
                  : d.status === 'returned' ? 'warning'
                  : d.status === 'processing' ? 'processing'
                  : 'default';
                return (
                  <Tooltip key={d.id} title={`${modLabel}: ${d.status === 'pending' ? '待处理' : d.status === 'processing' ? '处理中' : d.status === 'completed' ? '已完成' : '已退回'}${d.handler_name ? ` (${d.handler_name})` : ''}`}>
                    <Badge status={color as 'success' | 'warning' | 'processing' | 'default'} text={modLabel} />
                  </Tooltip>
                );
              })}
            </Space>
          );
        },
      },
      {
        title: '创建时间',
        dataIndex: 'created_at',
        key: 'created_at',
        width: 140,
        valueType: 'dateTime',
        sorter: true,
      },
      {
        title: '操作',
        key: 'actions',
        width: 300,
        hideInSearch: true,
        render: (_, record) => {
          const isTerminal = record.status === 'completed' || record.status === 'withdrawn';
          const canOperate = isBusinessUser && !isTerminal;
          return (
            <Space wrap size={[4, 4]}>
              <RefButton
                type="link"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => navigate(`/work-orders/${record.id}`)}
              >
                详情
              </RefButton>
              {canOperate && (
                <RefButton
                  type="link"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => navigate(`/work-orders/${record.id}`)}
                >
                  修改
                </RefButton>
              )}
              {canOperate && (
                <Popconfirm
                  title="申请撤回此工单？"
                  description="撤回申请需经后道办理人员审核同意。"
                  okText="申请撤回"
                  onConfirm={() => handleWithdraw(record)}
                >
                  <RefButton type="link" size="small" icon={<RollbackOutlined />}>撤回</RefButton>
                </Popconfirm>
              )}
              {canOperate && (
                <Popconfirm
                  title="申请作废此工单？"
                  description="作废后流程将终止，需经后道审核同意。"
                  okText="申请作废"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => handleVoid(record)}
                >
                  <RefButton type="link" size="small" danger icon={<StopOutlined />}>作废</RefButton>
                </Popconfirm>
              )}
              {canOperate && (
                <Popconfirm
                  title="确定催办此工单？"
                  onConfirm={() => handleUrge(record)}
                >
                  <RefButton type="link" size="small" icon={<BellOutlined />}>催办</RefButton>
                </Popconfirm>
              )}
              {canDelete && (
                <Popconfirm
                  title="确定删除此工单？"
                  description="删除后不可恢复，相关子工单也将一并清除。"
                  okText="删除"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => handleDelete(record.id)}
                >
                  <RefButton type="link" size="small" danger>删除</RefButton>
                </Popconfirm>
              )}
            </Space>
          );
        },
      },
    ],
    [navigate, isAdmin, isBusinessOwner, isGroupLeader, isBusinessUser, canDelete],
  );

  const requestFn = async (params: Record<string, unknown>) => {
    const result = await getWorkOrders({ ...params, ...quickFilters } as PageParams);
    return { data: result.list, success: true, total: result.total };
  };

  return (
    <PageContainer header={{ title: '入职管理', subTitle: viewDescription.title }}>
      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        message={
          <Space>
            <Tag color={viewDescription.color}>{viewDescription.title}</Tag>
            {viewDescription.desc}
          </Space>
        }
      />
      <Form form={searchForm} layout="inline" onValuesChange={handleQuickFilterChange} style={{ marginBottom: 16 }}>
        <Form.Item name="customerCode" label="客户代码"><Input allowClear placeholder="输入客户代码" style={{ width: 130 }} /></Form.Item>
        <Form.Item name="customerName" label="客户名称"><Input allowClear placeholder="输入客户名称" style={{ width: 130 }} /></Form.Item>
        <Form.Item name="employeeName" label="员工姓名"><Input allowClear placeholder="输入员工姓名" style={{ width: 110 }} /></Form.Item>
        <Form.Item name="idCardNo" label="证件号"><Input allowClear placeholder="输入证件号" style={{ width: 160 }} /></Form.Item>
        <Form.Item name="status" label="状态">
          <Select allowClear placeholder="选择状态" style={{ width: 110 }}
            options={Object.entries(STATUS_MAP).map(([value, { label }]) => ({ value, label }))}
          />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" onClick={applyQuickFilters}>搜索</Button>
            <Button onClick={resetQuickFilters}>重置</Button>
          </Space>
        </Form.Item>
      </Form>
      <MultiViewTable<WorkOrderItem>
        key={tableVersion}
        viewId="work-orders-main"
        columns={columns}
        request={requestFn}
        rowKey="id"
        headerTitle="主工单列表"
        kanbanColumnKey="status"
        kanbanAllowedValues={Object.entries(STATUS_MAP)
          .filter(([value]) => !['accepted', 'cancelled', 'skipped'].includes(value))
          .map(([value, { label, color }]) => ({ value, label, color }))}
        toolBarRender={() => [
          !isReadonlyViewer && <RefButton key="new" type="primary" icon={<PlusOutlined />} onClick={() => navigate('/work-orders/new')}>
            新建工单
          </RefButton>,
          !isReadonlyViewer && <RefButton key="import" icon={<ImportOutlined />} onClick={() => navigate('/work-orders/import')}>
            批量导入
          </RefButton>,
          <RefButton key="export" icon={<ExportOutlined />} onClick={handleBatchExport}>
            批量导出
          </RefButton>,
        ].filter(Boolean)}
        proTableOptions={false}
        proTableToolBarRender={false}
        batchActions={(selectedKeys, clear) => canDelete ? (
          <Space>
            <Popconfirm
              title={`确定删除选中的 ${selectedKeys.length} 条工单？`}
              description="删除后不可恢复，相关子工单也将一并清除。"
              okText="删除"
              okButtonProps={{ danger: true }}
              disabled={selectedKeys.length === 0}
              onConfirm={() => handleBatchDelete(selectedKeys, clear)}
            >
              <RefButton danger disabled={selectedKeys.length === 0}>
                批量删除
              </RefButton>
            </Popconfirm>
            <RefButton onClick={clear}>取消选择</RefButton>
          </Space>
        ) : undefined}
      />
    </PageContainer>
  );
};

export default WorkOrders;


