import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { App, Button, Space, Tag, Tooltip } from 'antd';
import { ExportOutlined, EyeOutlined } from '@ant-design/icons';
import {
  batchExportDispatchedOrders,
  downloadDispatchedExport,
  getDispatchedOrders,
} from '@/services/dispatchedOrders';
import type { DispatchedOrderItem } from '@/services/dispatchedOrders';
import type { PageParams } from '@/services/mock';
import { getModuleConfigs } from '@/services/moduleConfigs';
import type { ModuleConfigItem } from '@/services/moduleConfigs';
import { useAuth } from '@/hooks/useAuth';
// 团队页权限由角色动作矩阵控制，不再按固定角色放开办理入口。
import { DISPATCHED_PROCESSING_STATUS_FILTER_VALUE, normalizeDispatchedStatusSearchParams } from '@/utils/dispatchedStatusFilter';

const STATUS_OPTIONS = [
  { value: DISPATCHED_PROCESSING_STATUS_FILTER_VALUE, label: '处理中', color: 'blue' },
  { value: 'completed', label: '已完成', color: 'success' },
  { value: 'returned', label: '已退回', color: 'warning' },
  { value: 'withdrawn', label: '已撤回', color: 'default' },
  { value: 'void', label: '已作废', color: 'default' },
  { value: 'withdraw_pending', label: '撤回审批中', color: 'gold' },
  { value: 'void_pending', label: '作废审批中', color: 'gold' },
];
const STATUS_MAP: Record<string, { label: string; color: string }> = Object.fromEntries(STATUS_OPTIONS.map((item) => [item.value, item]));

const PRIORITY_OPTIONS = [
  { label: '紧急', value: 'urgent', color: 'red' },
  { label: '普通', value: 'normal', color: 'blue' },
];

function getPriorityMeta(priority?: string | null) {
  return PRIORITY_OPTIONS.find((item) => item.value === priority) || PRIORITY_OPTIONS[1];
}

const FALLBACK_MODULE_OPTIONS = [
  { label: '数据录入', value: 'data_entry' },
  { label: '社保公积金办理', value: 'social_insurance' },
  { label: '入职联系', value: 'onboarding_contact' },
  { label: '劳动合同签订', value: 'contract' },
  { label: '续签合同', value: 'renewal_contract' },
  { label: '离职联系', value: 'resignation_contact' },
  { label: '离职证明', value: 'resignation_cert' },
  { label: '待遇申报', value: 'benefit_apply' },
];

function getStatusMeta(status?: string | null) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'pending' || normalized === 'processing' || normalized === 'accepted' || normalized === 'in_progress') {
    return STATUS_MAP[DISPATCHED_PROCESSING_STATUS_FILTER_VALUE];
  }
  return STATUS_MAP[normalized] || { label: '状态未知', color: 'default' };
}

function getOperatorDisplay(record: DispatchedOrderItem) {
  if (record.status === 'completed') return record.handler_name || '实际操作人未记录';
  const configured = record.configured_handler_names || record.configuredHandlerNames || [];
  if (configured.length > 0) return configured.join('、');
  return record.handler_name || '负责人未配置';
}

const TeamDispatched: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { hasPermission } = useAuth();
  const canExport = hasPermission(['action:dispatched_order.export']);
  const actionRef = useRef<ActionType>();
  const [exporting, setExporting] = useState(false);
  const [moduleOptions, setModuleOptions] = useState<Array<{ label: string; value: string }>>(FALLBACK_MODULE_OPTIONS);

  useEffect(() => {
    let mounted = true;
    getModuleConfigs({ isActive: true })
      .then((list: ModuleConfigItem[]) => {
        if (!mounted) return;
        const subModules = list
          .filter((item) => {
            const type = String(item.module_type ?? item.moduleType ?? '').toLowerCase();
            return type === 'sub' || type === 'sub_module' || type === 'submodule';
          })
          .map((item) => ({ label: item.module_name, value: item.module_code }));
        setModuleOptions(subModules.length > 0 ? subModules : FALLBACK_MODULE_OPTIONS);
      })
      .catch(() => {
        if (mounted) setModuleOptions(FALLBACK_MODULE_OPTIONS);
      });
    return () => { mounted = false; };
  }, []);

  const moduleLabelMap = useMemo(() => Object.fromEntries(moduleOptions.map((item) => [item.value, item.label])), [moduleOptions]);
  const getModuleName = (code?: string | null) => moduleLabelMap[String(code || '')] || String(code || '未知模块');

  const handleBatchExport = async (ids: string[]) => {
    if (ids.length === 0) {
      message.warning('请先选择要导出的子工单');
      return;
    }
    setExporting(true);
    try {
      const result = await batchExportDispatchedOrders(ids);
      downloadDispatchedExport(result, '部门子工单固定模板导出.xlsx');
      message.success('导出成功');
    } catch {
      message.error('导出失败');
    } finally {
      setExporting(false);
    }
  };

  const columns: ProColumns<DispatchedOrderItem>[] = useMemo(() => [
    {
      title: '子工单号',
      dataIndex: 'order_no',
      key: 'order_no',
      width: 150,
      copyable: true,
      search: { transform: (value) => ({ orderNo: value }) },
    },
    {
      title: '模块',
      dataIndex: 'module_code',
      key: 'module_code',
      width: 150,
      valueType: 'select',
      fieldProps: { showSearch: true, allowClear: true, placeholder: '选择模块', options: moduleOptions, optionFilterProp: 'label' },
      search: { transform: (value) => ({ module_code: value }) },
      render: (_, record) => (
        <Tooltip title={`${getModuleName(record.module_code)}（${record.module_code}）`}>
          <span>{getModuleName(record.module_code)}</span>
        </Tooltip>
      ),
    },
    { title: '客户代码', dataIndex: 'customer_code', key: 'customer_code', width: 110, search: { transform: (value) => ({ customerCode: value }) } },
    { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name', width: 140, ellipsis: true, search: { transform: (value) => ({ customerName: value }) } },
    { title: '员工姓名', dataIndex: 'employee_name', key: 'employee_name', width: 100, search: { transform: (value) => ({ employeeName: value }) } },
    { title: '员工证件号', dataIndex: 'employee_id_card', key: 'employee_id_card', width: 170, ellipsis: true, search: { transform: (value) => ({ idCardNo: value }) } },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      valueType: 'select',
      fieldProps: { options: STATUS_OPTIONS.map(({ value, label }) => ({ value, label })) },
      render: (_, record) => {
        const status = getStatusMeta(record.status);
        return <Tag color={status.color}>{status.label}</Tag>;
      },
    },
    {
      title: '实际操作人/配置负责人',
      dataIndex: 'handler_name',
      key: 'handler_name',
      width: 190,
      hideInSearch: true,
      render: (_, record) => {
        const text = getOperatorDisplay(record);
        return record.status === 'completed' ? text : <Tag color={text === '负责人未配置' ? 'orange' : 'blue'}>{text}</Tag>;
      },
    },
    {
      title: '优先级', dataIndex: 'priority', key: 'priority', width: 90, valueType: 'select',
      fieldProps: { options: PRIORITY_OPTIONS.map(({ label, value }) => ({ label, value })) },
      render: (_, record) => {
        const priority = getPriorityMeta(record.priority);
        return <Tag color={priority.color}>{priority.label}</Tag>;
      },
    },
    { title: '派发时间', dataIndex: 'dispatched_at', key: 'dispatched_at', width: 150, valueType: 'dateTime', hideInSearch: true },
    { title: '完成时间', dataIndex: 'completed_at', key: 'completed_at', width: 150, valueType: 'dateTime', hideInSearch: true },
    {
      title: '派发时间',
      dataIndex: 'dispatchedRange',
      key: 'dispatchedRange',
      valueType: 'dateTimeRange',
      hideInTable: true,
      search: { transform: (value) => ({ dispatchedFrom: value?.[0], dispatchedTo: value?.[1] }) },
    },
    {
      title: '完成时间',
      dataIndex: 'completedRange',
      key: 'completedRange',
      valueType: 'dateTimeRange',
      hideInTable: true,
      search: { transform: (value) => ({ completedFrom: value?.[0], completedTo: value?.[1] }) },
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      hideInSearch: true,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate('/my-dispatched/' + record.id)}>
            详情
          </Button>
          {/* 团队工单仅查看，不提供删除操作 */}
        </Space>
      ),
    },
  ], [getModuleName, moduleOptions, navigate]);

  return (
    <PageContainer header={{ title: '部门子工单管理' }}>
      <ProTable<DispatchedOrderItem>
        actionRef={actionRef}
        columns={columns}
        request={async (params: PageParams & Record<string, unknown>) => {
          const query = normalizeDispatchedStatusSearchParams(params);
          const result = await getDispatchedOrders(query);
          return { data: result.list, success: true, total: result.total };
        }}
        rowKey="id"
        search={{ labelWidth: 'auto' }}
        headerTitle="部门子工单列表"
        toolBarRender={false}
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
        dateFormatter="string"
        rowSelection={canExport ? { preserveSelectedRowKeys: true } : false}
        tableAlertRender={({ selectedRowKeys, onCleanSelected }) => (
          <Space wrap>
            <span>已选 {selectedRowKeys.length} 项</span>
            <Button size="small" onClick={onCleanSelected}>取消</Button>
            <Button size="small" icon={<ExportOutlined />} loading={exporting} onClick={() => handleBatchExport(selectedRowKeys.map(String))}>
              按固定模板导出
            </Button>
          </Space>
        )}
      />

      {/* 团队工单仅查看：不提供导入、批量完成、批量退回、删除等办理入口。 */}
    </PageContainer>
  );
};

export default TeamDispatched;
