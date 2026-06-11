import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Dayjs } from 'dayjs';
import { useParams, useNavigate } from 'react-router-dom';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { App, Alert, Badge, Button, Checkbox, DatePicker, Form, Input, Modal, Space, Tag, Tooltip } from 'antd';
import { BellOutlined, CheckCircleOutlined, ExportOutlined, EyeOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons';
import {
  batchAcceptDispatchedOrders,
  batchCompleteDispatchedOrders,
  batchExportDispatchedOrders,
  batchUrgeDispatchedOrders,
  downloadDispatchedExport,
  getDispatchedOrders,
} from '@/services/dispatchedOrders';
import type { DispatchedOrderItem } from '@/services/dispatchedOrders';
import DispatchedBatchImportModal from '@/components/DispatchedBatchImportModal';
import type { DispatchedBatchImportMode } from '@/components/DispatchedBatchImportModal';
import type { PageParams } from '@/services/mock';
import { getModuleLabel, getModuleTitle } from '@/constants/modules';
import { getStatusColor, getStatusText } from '@/constants/dictionaries';
import { useAuth } from '@/hooks/useAuth';
import { DISPATCHED_NINE_STATUS_OPTIONS } from '@/utils/dispatchedStatusFilter';
import { getCachedMonthOrNull, toMonthKey, updateCachedListPageState } from '@/utils/listPageState';

const RefButton = forwardRef<HTMLButtonElement, React.ComponentProps<typeof Button>>((props, ref) => (
  <Button ref={ref} {...props} />
));
RefButton.displayName = 'RefButton';

const SOCIAL_REMARK_PLACEHOLDER = '请输入办理备注';
const ACTIVE_DISPATCHED_STATUSES = new Set(['pending', 'processing']);
const PENDING_DISPATCHED_STATUSES = new Set(['pending']);
const DISPATCHED_PROCESSING_FILTER_STATUSES = ['pending', 'processing'] as const;

export const DISPATCHED_STATUS_FILTER_OPTIONS: Array<{ label: string; value: string }> = [
  ...DISPATCHED_NINE_STATUS_OPTIONS,
];

type TableFilterValue = Array<string | number | bigint | boolean> | null | undefined;
type TableFilters = Record<string, TableFilterValue>;
type ControlledFilters = Record<string, React.Key[] | null>;

export const getFilterValues = (filters: TableFilters, key: string): string[] => {
  const value = filters[key];
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
};

export const getFirstFilterValue = (filters: TableFilters, key: string) => getFilterValues(filters, key)[0];

export const serializeFilterValues = (filters: TableFilters, key: string): string | undefined => {
  const values = getFilterValues(filters, key);
  return values.length > 0 ? values.join(',') : undefined;
};

export const normalizeTableFilters = (filters: TableFilters): ControlledFilters => {
  return Object.entries(filters).reduce<ControlledFilters>((acc, [key, value]) => {
    if (Array.isArray(value) && value.length > 0) {
      const normalized = value.map((item) => String(item ?? '').trim()).filter(Boolean);
      if (normalized.length > 0) acc[key] = normalized;
    }
    return acc;
  }, {});
};

export const areControlledFiltersEqual = (left: ControlledFilters, right: ControlledFilters): boolean => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => {
    const leftValues = left[key] || [];
    const rightValues = right[key] || [];
    if (leftValues.length !== rightValues.length) return false;
    return leftValues.every((value, index) => String(value) === String(rightValues[index]));
  });
};

export const hasTableFilterPayload = (filters: TableFilters): boolean => Object.keys(filters).length > 0;

export const getEffectiveHeaderFilters = (
  filters: TableFilters = {},
  controlledFilters: ControlledFilters = {},
): TableFilters => (hasTableFilterPayload(filters) ? filters : controlledFilters as TableFilters);

export const buildEffectiveHeaderFilterParams = (
  filters: TableFilters = {},
  controlledFilters: ControlledFilters = {},
) => buildHeaderFilterParams(getEffectiveHeaderFilters(filters, controlledFilters));

export const buildHeaderFilterParams = (filters: TableFilters) => {
  const params: Record<string, string | undefined> = {
    orderNo: getFirstFilterValue(filters, 'order_no'),
    customerCode: getFirstFilterValue(filters, 'customer_code'),
    customerName: getFirstFilterValue(filters, 'customer_name'),
    employeeName: getFirstFilterValue(filters, 'employee_name'),
    idCardNo: getFirstFilterValue(filters, 'employee_id_card'),
    createdByName: getFirstFilterValue(filters, 'created_by_name'),
  };
  const statuses = serializeFilterValues(filters, 'status');
  if (statuses) params.statuses = statuses;
  return params;
};

const textHeaderFilter = (placeholder: string): Pick<ProColumns<DispatchedOrderItem>, 'filterDropdown' | 'filterIcon'> => ({
  filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }) => (
    <div role="presentation" style={{ padding: 8, width: 260 }} onKeyDown={(event) => event.stopPropagation()}>
      <Input
        allowClear
        placeholder={placeholder}
        value={String(selectedKeys[0] ?? '')}
        onChange={(event) => setSelectedKeys(event.target.value ? [event.target.value] : [])}
        onPressEnter={() => confirm()}
        style={{ marginBottom: 8, display: 'block' }}
      />
      <Space>
        <Button type="primary" size="small" icon={<SearchOutlined />} onClick={() => confirm()}>
          筛选
        </Button>
        <Button
          size="small"
          onClick={() => {
            clearFilters?.();
            confirm();
          }}
        >
          重置
        </Button>
        <Button size="small" onClick={() => close?.()}>
          取消
        </Button>
      </Space>
    </div>
  ),
  filterIcon: (filtered) => <SearchOutlined style={{ color: filtered ? '#1677ff' : undefined }} />,
});

const selectHeaderFilter = (
  placeholder: string,
  options: Array<{ label: string; value: string }>,
): Pick<ProColumns<DispatchedOrderItem>, 'filterDropdown' | 'filterIcon' | 'filterMultiple'> => ({
  filterMultiple: true,
  filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }) => (
    <div role="presentation" style={{ padding: 8, width: 220 }} onKeyDown={(event) => event.stopPropagation()}>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{placeholder}</div>
      <Space style={{ borderBottom: '1px solid #f0f0f0', paddingBottom: 8, marginBottom: 8 }}>
        <Button type="primary" size="small" icon={<SearchOutlined />} onClick={() => confirm()}>
          筛选
        </Button>
        <Button
          size="small"
          onClick={() => {
            clearFilters?.();
            confirm();
          }}
        >
          重置
        </Button>
        <Button size="small" onClick={() => close?.()}>
          取消
        </Button>
      </Space>
      <div style={{ maxHeight: 120, overflowY: 'auto', paddingRight: 4 }}>
        <Checkbox.Group
          value={selectedKeys as string[]}
          onChange={(values) => setSelectedKeys(values as React.Key[])}
          style={{ width: '100%' }}
        >
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            {options.map((item) => (
              <Checkbox key={item.value} value={item.value}>{item.label}</Checkbox>
            ))}
          </Space>
        </Checkbox.Group>
      </div>
    </div>
  ),
  filterIcon: (filtered) => <SearchOutlined style={{ color: filtered ? '#1677ff' : undefined }} />,
});

const OnboardingModule: React.FC = () => {
  const { moduleCode } = useParams<{ moduleCode: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { hasRole } = useAuth();
  const actionRef = useRef<ActionType>();
  const didMountFilterReloadRef = useRef(false);
  const [selectedRows, setSelectedRows] = useState<DispatchedOrderItem[]>([]);
  const [tableFilters, setTableFilters] = useState<ControlledFilters>({});
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchForm] = Form.useForm();
  const [batchImportMode, setBatchImportMode] = useState<DispatchedBatchImportMode | null>(null);
  const [exporting, setExporting] = useState(false);

  const currentModule = moduleCode || '';
  const pageStateKey = `onboarding-module-${currentModule || 'unknown'}`;
  const [month, setMonth] = useState<Dayjs | null>(() => getCachedMonthOrNull(pageStateKey));
  const backendModuleCode = currentModule === 'social_insurance_resign' ? 'resignation_social_insurance' : currentModule;
  const moduleLabel = getModuleLabel(currentModule);

  useEffect(() => {
    setMonth(getCachedMonthOrNull(pageStateKey));
    setTableFilters((previousFilters) => (
      areControlledFiltersEqual(previousFilters, {}) ? previousFilters : {}
    ));
    setSelectedRows((previousRows) => (previousRows.length === 0 ? previousRows : []));
  }, [currentModule, pageStateKey]);

  useEffect(() => {
    if (!didMountFilterReloadRef.current) {
      didMountFilterReloadRef.current = true;
      return;
    }
    actionRef.current?.reload();
  }, [tableFilters]);

  const handleTableChange = useCallback((_: unknown, filters: TableFilters) => {
    const nextFilters = normalizeTableFilters(filters);
    setTableFilters((previousFilters) => (
      areControlledFiltersEqual(previousFilters, nextFilters) ? previousFilters : nextFilters
    ));
  }, []);

  const isSocialModule = ['social_insurance', 'social_insurance_resign', 'resignation_social_insurance'].includes(currentModule);
  const canOperateCurrentModule = hasRole('admin')
    || (['contract', 'renewal_contract'].includes(currentModule) && (hasRole('labor_contract_member') || hasRole('shared_team_owner')))
    || (['onboarding_contact', 'resignation_contact'].includes(currentModule) && (hasRole('onboarding_resignation_member') || hasRole('shared_team_owner')))
    || (['data_entry', 'data_entry_resign'].includes(currentModule) && hasRole('data_entry_leader'))
    || (['social_insurance', 'social_insurance_resign', 'resignation_social_insurance'].includes(currentModule) && hasRole('social_insurance_specialist'));
  const canBackendOperate = canOperateCurrentModule;
  const canBatchComplete = canBackendOperate;
  const canBatchUrge = hasRole('admin') || hasRole('business_group_member') || hasRole('business_group_leader') || hasRole('business_owner');
  const canSelectRows = canBackendOperate || canBatchUrge;

  const columns: ProColumns<DispatchedOrderItem>[] = useMemo(() => [
    {
      title: '查看',
      key: 'actions',
      width: 88,
      fixed: 'left',
      hideInSearch: true,
      render: (_, record) => (
        <RefButton type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/my-dispatched/${record.id}`)}>
          查看
        </RefButton>
      ),
    },
    {
      title: '子工单号',
      dataIndex: 'order_no',
      key: 'order_no',
      width: 160,
      copyable: true,
      search: { transform: (value) => ({ orderNo: value }) },
      filteredValue: tableFilters.order_no || null,
      ...textHeaderFilter('输入子工单号'),
      render: (_, record) => (
        <Space size={4}>
          {record.has_unread_dirty && (
            <Tooltip title="业务员更新了字段，请打开详情核对">
              <Badge color="red" />
            </Tooltip>
          )}
          <span>{record.order_no}</span>
          {record.has_unread_dirty && <Tag color="red">有字段变更</Tag>}
        </Space>
      ),
    },
    { title: '客户代码', dataIndex: 'customer_code', key: 'customer_code', width: 130, search: { transform: (value) => ({ customerCode: value }) }, filteredValue: tableFilters.customer_code || null, ...textHeaderFilter('输入客户代码') },
    { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name', width: 190, search: { transform: (value) => ({ customerName: value }) }, filteredValue: tableFilters.customer_name || null, ...textHeaderFilter('输入客户名称') },
    { title: '员工姓名', dataIndex: 'employee_name', key: 'employee_name', width: 120, search: { transform: (value) => ({ employeeName: value }) }, filteredValue: tableFilters.employee_name || null, ...textHeaderFilter('输入员工姓名') },
    { title: '证件号', dataIndex: 'employee_id_card', key: 'employee_id_card', width: 190, search: { transform: (value) => ({ idCardNo: value }) }, filteredValue: tableFilters.employee_id_card || null, ...textHeaderFilter('输入证件号') },
    { title: '发起人', dataIndex: 'created_by_name', key: 'created_by_name', width: 120, hideInSearch: true, filteredValue: tableFilters.created_by_name || null, ...textHeaderFilter('输入发起人'), renderText: (value, record) => value || record.created_by || '-' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      valueType: 'select',
      filteredValue: tableFilters.status || null,
      fieldProps: { options: DISPATCHED_STATUS_FILTER_OPTIONS },
      ...selectHeaderFilter('选择状态', DISPATCHED_STATUS_FILTER_OPTIONS),
      render: (_, record) => <Tag color={getStatusColor(record.status)}>{getStatusText(record.status)}</Tag>,
    },
    { title: '派发时间', dataIndex: 'dispatched_at', key: 'dispatched_at', width: 160, valueType: 'dateTime', sorter: true, hideInSearch: true },
    { title: '完成时间', dataIndex: 'completed_at', key: 'completed_at', width: 160, valueType: 'dateTime', hideInSearch: true },
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
    
  ], [navigate, tableFilters]);

  const requestFn = useCallback(async (params: PageParams, _sort: Record<string, unknown>, filters: TableFilters = {}) => {
    const headerFilters = buildEffectiveHeaderFilterParams(filters, tableFilters);
    const result = await getDispatchedOrders({
      ...params,
      ...headerFilters,
      module_code: backendModuleCode,
      orderMonth: month ? month.format('YYYY-MM') : undefined,
    });
    return { data: result.list, success: true, total: result.total };
  }, [backendModuleCode, month, tableFilters]);

  const handleBatchAccept = async (rows: DispatchedOrderItem[] = selectedRows) => {
    const ids = rows
      .filter((row) => row.module_code === backendModuleCode && PENDING_DISPATCHED_STATUSES.has(row.status))
      .map((row) => row.id);
    if (ids.length === 0) {
      message.warning('请选择当前模块未接单的子工单');
      return;
    }
    try {
      const result = await batchAcceptDispatchedOrders(ids);
      const skipped = result.skipped?.length ?? 0;
      if (skipped > 0) message.warning(`已接单 ${result.accepted} 条，${skipped} 条跳过`);
      else message.success(`已接单 ${result.accepted} 条子工单`);
      setSelectedRows([]);
      actionRef.current?.reload();
    } catch {
      message.error('批量接单失败');
    }
  };

  const handleBatchUrge = async (rows: DispatchedOrderItem[] = selectedRows) => {
    const ids = rows
      .filter((row) => row.module_code === backendModuleCode && ACTIVE_DISPATCHED_STATUSES.has(row.status))
      .map((row) => row.id);
    if (ids.length === 0) {
      message.warning('请选择当前模块处理中子工单');
      return;
    }
    try {
      const result = await batchUrgeDispatchedOrders(ids, '业务员批量催办：请尽快处理');
      const skipped = result.skipped?.length ?? 0;
      if (skipped > 0) message.warning(`已催办 ${result.urged} 条，${skipped} 条跳过`);
      else message.success(`已催办 ${result.urged} 条子工单`);
      setSelectedRows([]);
      actionRef.current?.reload();
    } catch {
      message.error('批量催办失败');
    }
  };

  const handleBatchExport = async (rows: DispatchedOrderItem[] = selectedRows) => {
    const exportRows = rows.filter((row) => row.module_code === backendModuleCode);
    if (exportRows.length === 0) {
      message.warning('请先选择当前子工单页面中要导出的数据');
      return;
    }
    // 后端按 模块::电子签平台 分组，每组生成一个独立文件并在 result.files 返回；
    // 前端只发一次请求，拿到 files 后逐个下载（速创、E签宝各自成独立文件）。
    setExporting(true);
    try {
      const result = await batchExportDispatchedOrders(exportRows.map((row) => row.id));
      const files = result.files && result.files.length > 0 ? result.files : null;
      if (files) {
        let failed = 0;
        for (const file of files) {
          const platform = file.signPlatform ? `-${file.signPlatform}` : '';
          try {
            await downloadDispatchedExport(file, `${moduleLabel}子工单${platform}.xlsx`);
          } catch {
            failed += 1;
          }
        }
        if (failed === 0) {
          message.success(files.length > 1 ? `导出成功，共 ${files.length} 个文件` : '导出成功');
        } else if (failed < files.length) {
          message.warning(`部分导出失败，${files.length - failed} 个文件已下载，${failed} 个失败`);
        } else {
          message.error('导出失败');
        }
      } else {
        await downloadDispatchedExport(result, `${moduleLabel}子工单.xlsx`);
        message.success('导出成功');
      }
    } catch {
      message.error('导出失败');
    } finally {
      setExporting(false);
    }
  };

  const handleBatchOk = async () => {
    const values = await batchForm.validateFields();
    const remark = String(values.remark || '').trim();
    const ids = selectedRows.filter((row) => row.module_code === backendModuleCode && ACTIVE_DISPATCHED_STATUSES.has(row.status)).map((row) => row.id);
    if (ids.length === 0) {
      message.warning('请选择当前模块未完成的子工单');
      return;
    }
    setBatchLoading(true);
    try {
      const result = await batchCompleteDispatchedOrders(ids, remark);
      const skipped = result.skipped?.length ?? 0;
      if (skipped > 0) {
        message.warning(`已完成 ${result.completed} 条，${skipped} 条跳过或失败，请检查状态和权限`);
      } else {
        message.success(`已完成 ${result.completed} 条子工单`);
      }
      setBatchOpen(false);
      batchForm.resetFields();
      setSelectedRows([]);
      actionRef.current?.reload();
    } catch {
      message.error('批量完成子工单失败');
    } finally {
      setBatchLoading(false);
    }
  };

  return (
    <PageContainer header={{
      title: getModuleTitle(currentModule),
      extra: [
        <Space key="month">
          <span>工单月份：</span>
          <DatePicker
            picker="month"
            allowClear
            placeholder="全部月份"
            value={month}
            onChange={(value) => {
              setMonth(value);
              updateCachedListPageState(pageStateKey, { month: value ? toMonthKey(value) : '', current: 1 });
              actionRef.current?.reload();
            }}
          />
        </Space>,
      ],
    }}>
      <ProTable<DispatchedOrderItem>
        key={currentModule}
        getPopupContainer={() => document.body}
        actionRef={actionRef}
        columns={columns}
        request={requestFn}
        onChange={handleTableChange}
        rowKey="id"
        search={false}
        headerTitle={`${moduleLabel}列表`}
        options={false}
        toolBarRender={() => canBackendOperate ? [
          <Button key="import-status" icon={<UploadOutlined />} onClick={() => setBatchImportMode('status')}>
            导入办理结果
          </Button>,
          ...(currentModule === 'onboarding_contact' ? [
            <Button key="import-fields" icon={<UploadOutlined />} onClick={() => setBatchImportMode('fields')}>
              导入银行卡修改
            </Button>,
          ] : []),
          <Button key="export" icon={<ExportOutlined />} loading={exporting} disabled={selectedRows.length === 0} onClick={() => handleBatchExport()}>
            按固定模板导出
          </Button>,
          <Button
            key="batch-accept"
            icon={<CheckCircleOutlined />}
            disabled={selectedRows.filter((row) => PENDING_DISPATCHED_STATUSES.has(row.status)).length === 0}
            onClick={() => handleBatchAccept()}
          >
            批量接单
          </Button>,
          <Button
            key="batch"
            type="primary"
            icon={<CheckCircleOutlined />}
            disabled={selectedRows.filter((row) => ACTIVE_DISPATCHED_STATUSES.has(row.status)).length === 0}
            onClick={() => { batchForm.resetFields(); setBatchOpen(true); }}
          >
            批量完成
          </Button>,
        ] : []}
        rowSelection={canSelectRows ? {
          selectedRowKeys: selectedRows.map((row) => row.id),
          onChange: (_keys, rows) => setSelectedRows(rows),
          preserveSelectedRowKeys: true,
          getCheckboxProps: (record) => ({
            disabled: !(
              canBackendOperate
              || (canBatchUrge && ACTIVE_DISPATCHED_STATUSES.has(record.status))
            ),
          }),
        } : undefined}
        tableAlertRender={canSelectRows ? ({ selectedRowKeys, selectedRows: alertSelectedRows, onCleanSelected }) => {
          const selected = alertSelectedRows as DispatchedOrderItem[];
          const activeRows = selected.filter((row) => ACTIVE_DISPATCHED_STATUSES.has(row.status));
          const acceptable = canBackendOperate ? selected.filter((row) => PENDING_DISPATCHED_STATUSES.has(row.status)) : [];
          const completable = canBatchComplete ? activeRows : [];
          const urgeable = canBatchUrge ? activeRows : [];
          return (
            <Space wrap>
              <span>已选 {selectedRowKeys.length} 项</span>
              <Button size="small" onClick={() => { onCleanSelected(); setSelectedRows([]); }}>取消</Button>
              {canBackendOperate && (
                <Button size="small" icon={<ExportOutlined />} loading={exporting} disabled={selected.length === 0} onClick={() => handleBatchExport(selected)}>
                  按固定模板导出{selected.length > 0 ? `（${selected.length}）` : ''}
                </Button>
              )}
              {canBackendOperate && (
                <Button
                  size="small"
                  icon={<CheckCircleOutlined />}
                  disabled={acceptable.length === 0}
                  onClick={() => {
                    setSelectedRows(acceptable);
                    handleBatchAccept(acceptable);
                  }}
                >
                  批量接单{acceptable.length > 0 ? `（${acceptable.length}）` : ''}
                </Button>
              )}
              {canBatchComplete && (
                <Button
                  size="small"
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  disabled={completable.length === 0}
                  onClick={() => {
                    setSelectedRows(completable);
                    batchForm.resetFields();
                    setBatchOpen(true);
                  }}
                >
                  批量完成{completable.length > 0 ? `（${completable.length}）` : ''}
                </Button>
              )}
              {canBatchUrge && (
                <Button
                  size="small"
                  icon={<BellOutlined />}
                  disabled={urgeable.length === 0}
                  onClick={() => {
                    setSelectedRows(urgeable);
                    handleBatchUrge(urgeable);
                  }}
                >
                  批量催办{urgeable.length > 0 ? `（${urgeable.length}）` : ''}
                </Button>
              )}
            </Space>
          );
        } : false}
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
        scroll={{ x: 1280 }}
        dateFormatter="string"
      />

      <Modal
        title={`批量完成${moduleLabel}子工单`}
        open={batchOpen}
        onOk={handleBatchOk}
        onCancel={() => setBatchOpen(false)}
        confirmLoading={batchLoading}
        okText="确认完成"
        destroyOnHidden
      >

        <Form form={batchForm} layout="vertical">
          <Form.Item
            name="remark"
            label="办理备注"
            rules={[
              { required: true, message: '请填写办理备注' },
              { validator: (_, value) => String(value || '').trim() ? Promise.resolve() : Promise.reject(new Error('办理备注不能只填空格')) },
            ]}
          >
            <Input.TextArea rows={4} maxLength={500} showCount placeholder={isSocialModule ? SOCIAL_REMARK_PLACEHOLDER : '请输入办理备注'} />
          </Form.Item>
        </Form>
      </Modal>

      <DispatchedBatchImportModal
        open={batchImportMode !== null}
        mode={batchImportMode || 'status'}
        moduleOptions={[{ label: moduleLabel, value: currentModule }]}
        defaultModuleCode={currentModule}
        hideModuleSelect
        onClose={() => setBatchImportMode(null)}
        onImported={() => actionRef.current?.reload()}
      />
    </PageContainer>
  );
};

export default OnboardingModule;
