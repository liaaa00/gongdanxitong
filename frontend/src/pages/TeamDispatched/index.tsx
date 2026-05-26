import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Alert, App, Button, Input, Modal, Popconfirm, Space, Tag, Tooltip } from 'antd';
import { CheckCircleOutlined, DeleteOutlined, ExportOutlined, EyeOutlined, RollbackOutlined, UploadOutlined } from '@ant-design/icons';
import {
  batchCompleteDispatchedOrders,
  batchDeleteDispatchedOrders,
  batchExportDispatchedOrders,
  batchReturnDispatchedOrders,
  deleteDispatchedOrder,
  downloadDispatchedExport,
  getDispatchedOrders,
} from '@/services/dispatchedOrders';
import type { DispatchedOrderItem } from '@/services/dispatchedOrders';
import DispatchedBatchImportModal from '@/components/DispatchedBatchImportModal';
import type { DispatchedBatchImportMode } from '@/components/DispatchedBatchImportModal';
import type { PageParams } from '@/services/mock';
import { getModuleConfigs } from '@/services/moduleConfigs';
import type { ModuleConfigItem } from '@/services/moduleConfigs';
import { useAuth } from '@/hooks/useAuth';
import { ROLE } from '@/constants/roles';
import { DISPATCHED_PROCESSING_STATUS_FILTER_VALUE, normalizeDispatchedStatusSearchParams } from '@/utils/dispatchedStatusFilter';

const TERMINAL_OR_APPROVAL_STATUSES = ['completed', 'withdraw_pending', 'withdrawn', 'void_pending', 'void'];

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
  const { hasRole } = useAuth();
  const isAdmin = hasRole(ROLE.ADMIN);
  const actionRef = useRef<ActionType>();
  const [exporting, setExporting] = useState(false);
  const [batchImportMode, setBatchImportMode] = useState<DispatchedBatchImportMode | null>(null);
  const [batchCompleteVisible, setBatchCompleteVisible] = useState(false);
  const [batchCompleteIds, setBatchCompleteIds] = useState<string[]>([]);
  const [batchCompleteRemark, setBatchCompleteRemark] = useState('');
  const [batchCompleteLoading, setBatchCompleteLoading] = useState(false);
  const [batchReturnVisible, setBatchReturnVisible] = useState(false);
  const [batchReturnIds, setBatchReturnIds] = useState<string[]>([]);
  const [batchReturnReason, setBatchReturnReason] = useState('');
  const [batchReturnLoading, setBatchReturnLoading] = useState(false);
  const [batchCleanFn, setBatchCleanFn] = useState<(() => void) | null>(null);
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

  const handleBatchComplete = async () => {
    const remark = batchCompleteRemark.trim();
    if (!remark) {
      message.warning('请填写批量完成备注');
      return;
    }
    if (batchCompleteIds.length === 0) {
      message.warning('未选择任何子工单');
      return;
    }
    setBatchCompleteLoading(true);
    try {
      const res = await batchCompleteDispatchedOrders(batchCompleteIds, remark);
      const skipped = res.skipped?.length ?? 0;
      if (skipped > 0) message.warning(`成功完成 ${res.completed} 条，${skipped} 条跳过`);
      else message.success(`已批量完成 ${res.completed} 条子工单`);
      setBatchCompleteVisible(false);
      setBatchCompleteRemark('');
      setBatchCompleteIds([]);
      batchCleanFn?.();
      actionRef.current?.reload();
    } catch {
      message.error('批量完成失败');
    } finally {
      setBatchCompleteLoading(false);
    }
  };

  const handleBatchReturn = async () => {
    const reason = batchReturnReason.trim();
    if (!reason) {
      message.warning('请填写批量退回原因');
      return;
    }
    if (batchReturnIds.length === 0) {
      message.warning('未选择任何子工单');
      return;
    }
    setBatchReturnLoading(true);
    try {
      const res = await batchReturnDispatchedOrders(batchReturnIds, reason);
      const skipped = res.skipped?.length ?? 0;
      if (skipped > 0) message.warning(`成功退回 ${res.returned} 条，${skipped} 条跳过`);
      else message.success(`已批量退回 ${res.returned} 条子工单`);
      setBatchReturnVisible(false);
      setBatchReturnReason('');
      setBatchReturnIds([]);
      batchCleanFn?.();
      actionRef.current?.reload();
    } catch {
      message.error('批量退回失败');
    } finally {
      setBatchReturnLoading(false);
    }
  };

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

  const handleDelete = async (id: string) => {
    try {
      await deleteDispatchedOrder(id);
      message.success('删除成功');
      actionRef.current?.reload();
    } catch (err) {
      message.error('删除失败');
      throw err;
    }
  };

  const handleBatchDelete = (ids: string[], onCleanSelected: () => void) => {
    Modal.confirm({
      title: '确认批量删除选中的部门子工单？',
      content: `将删除已选 ${ids.length} 条子工单，建议仅用于清理测试数据，请再次确认。`,
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          const result = await batchDeleteDispatchedOrders(ids);
          if (result.failed > 0) {
            message.warning(`删除完成：成功 ${result.success} 条，失败 ${result.failed} 条`);
          } else {
            message.success(`已删除 ${result.success} 条子工单`);
          }
          onCleanSelected();
          actionRef.current?.reload();
        } catch (err) {
          message.error('批量删除失败');
          throw err;
        }
      },
    });
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
          {isAdmin && (
            <Popconfirm
              title="确认删除该部门子工单？"
              description="删除后不可恢复，建议仅用于清理测试数据。"
              okText="确认删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => handleDelete(record.id)}
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ], [getModuleName, isAdmin, moduleOptions, navigate]);

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
        toolBarRender={() => [
          <Button key="import-status" icon={<UploadOutlined />} onClick={() => setBatchImportMode('status')}>导入办理结果</Button>,
          <Button key="import-fields" icon={<UploadOutlined />} onClick={() => setBatchImportMode('fields')}>导入银行卡修改</Button>,
        ]}
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
        dateFormatter="string"
        rowSelection={{ preserveSelectedRowKeys: true }}
        tableAlertRender={({ selectedRowKeys, selectedRows, onCleanSelected }) => {
          const selected = selectedRows as DispatchedOrderItem[];
          const operable = selected.filter((record) => !TERMINAL_OR_APPROVAL_STATUSES.includes(record.status) && !record.void_at);
          return (
            <Space wrap>
              <span>已选 {selectedRowKeys.length} 项</span>
              <Button size="small" onClick={onCleanSelected}>取消</Button>
              <Button
                size="small"
                type="primary"
                icon={<CheckCircleOutlined />}
                disabled={operable.length === 0}
                onClick={() => {
                  setBatchCompleteIds(operable.map((record) => record.id));
                  setBatchCompleteRemark('');
                  setBatchCleanFn(() => onCleanSelected);
                  setBatchCompleteVisible(true);
                }}
              >
                批量完成{operable.length > 0 ? `（${operable.length}）` : ''}
              </Button>
              <Button
                size="small"
                danger
                icon={<RollbackOutlined />}
                disabled={operable.length === 0}
                onClick={() => {
                  setBatchReturnIds(operable.map((record) => record.id));
                  setBatchReturnReason('');
                  setBatchCleanFn(() => onCleanSelected);
                  setBatchReturnVisible(true);
                }}
              >
                批量退回{operable.length > 0 ? `（${operable.length}）` : ''}
              </Button>
              <Button size="small" icon={<ExportOutlined />} loading={exporting} onClick={() => handleBatchExport(selectedRowKeys.map(String))}>
                按固定模板导出
              </Button>
              {isAdmin && (
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleBatchDelete(selectedRowKeys.map(String), onCleanSelected)}>
                  批量删除
                </Button>
              )}
            </Space>
          );
        }}
      />

      <Modal
        title="批量完成子工单"
        open={batchCompleteVisible}
        confirmLoading={batchCompleteLoading}
        onOk={handleBatchComplete}
        onCancel={() => {
          setBatchCompleteVisible(false);
          setBatchCompleteRemark('');
        }}
        width={520}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert type="info" showIcon message={`将批量完成 ${batchCompleteIds.length} 条子工单，已完成或审批中的子单已自动跳过。`} />
          <span>批量完成备注（必填）：</span>
          <Input.TextArea
            rows={4}
            value={batchCompleteRemark}
            onChange={(event) => setBatchCompleteRemark(event.target.value)}
            placeholder="请输入批量完成说明，例如：本批次已线下办理完成"
            maxLength={1024}
            showCount
          />
        </Space>
      </Modal>

      <Modal
        title="批量退回子工单"
        open={batchReturnVisible}
        confirmLoading={batchReturnLoading}
        onOk={handleBatchReturn}
        onCancel={() => {
          setBatchReturnVisible(false);
          setBatchReturnReason('');
        }}
        width={520}
        okButtonProps={{ danger: true }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert type="warning" showIcon message={`将批量退回 ${batchReturnIds.length} 条子工单，已完成或审批中的子单已自动跳过。`} />
          <span>批量退回原因（必填）：</span>
          <Input.TextArea
            rows={4}
            value={batchReturnReason}
            onChange={(event) => setBatchReturnReason(event.target.value)}
            placeholder="请输入退回原因，例如：资料不完整，需要业务员补充"
            maxLength={512}
            showCount
          />
        </Space>
      </Modal>

      <DispatchedBatchImportModal
        open={batchImportMode !== null}
        mode={batchImportMode || 'status'}
        moduleOptions={moduleOptions}
        defaultModuleCode="onboarding_contact"
        onClose={() => setBatchImportMode(null)}
        onImported={() => actionRef.current?.reload()}
      />
    </PageContainer>
  );
};

export default TeamDispatched;
