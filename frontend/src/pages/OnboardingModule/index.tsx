import { forwardRef, useRef, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import type { ProColumns, ActionType } from '@ant-design/pro-components';
import { ProTable } from '@ant-design/pro-components';
import { Button, Tag, Space, Badge, Tooltip, Modal, Form, Input, App, Alert } from 'antd';
import { EyeOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { getDispatchedOrders, batchCompleteDispatchedOrders } from '@/services/dispatchedOrders';
import type { DispatchedOrderItem } from '@/services/dispatchedOrders';
import type { PageParams } from '@/services/mock';
import { getModuleColor, getModuleLabel, getModuleTitle } from '@/constants/modules';
import { getStatusColor, getStatusText } from '@/constants/dictionaries';
import { useAuth } from '@/hooks/useAuth';

const RefButton = forwardRef<HTMLButtonElement, React.ComponentProps<typeof Button>>((props, ref) => (
  <Button ref={ref} {...props} />
));
RefButton.displayName = 'RefButton';

const SOCIAL_REMARK_PLACEHOLDER = '例如：2026年6月社保新增，社保基数 5000，公积金基数 5000，操作类型：新增；无异常。';

const OnboardingModule: React.FC = () => {
  const { moduleCode } = useParams<{ moduleCode: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { hasRole } = useAuth();
  const actionRef = useRef<ActionType>();
  const [selectedRows, setSelectedRows] = useState<DispatchedOrderItem[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchForm] = Form.useForm();

  const currentModule = moduleCode || '';
  const isSocialModule = currentModule === 'social_insurance';
  const canBatchComplete = hasRole('admin') || hasRole('data_entry_leader') || hasRole('shared_team_owner');

  const columns: ProColumns<DispatchedOrderItem>[] = useMemo(() => [
    { title: '子工单号', dataIndex: 'order_no', key: 'order_no', width: 160, copyable: true,
      render: (_, r) => (
        <Space size={4}>
          {r.has_unread_dirty && (
            <Tooltip title="业务员更新了字段，请打开详情核对">
              <Badge color="red" />
            </Tooltip>
          )}
          <span>{r.order_no}</span>
          {r.has_unread_dirty && <Tag color="red">有字段变更</Tag>}
        </Space>
      ),
    },
    { title: '员工', dataIndex: 'employee_name', key: 'employee_name', width: 100 },
    { title: '客户', dataIndex: 'customer_name', key: 'customer_name', width: 140 },
    { title: '模块', dataIndex: 'module_code', key: 'module_code', width: 130,
      render: (_, r) => <Tag color={getModuleColor(r.module_code)}>{getModuleLabel(r.module_code)}</Tag>,
    },
    { title: '处理人', dataIndex: 'handler_name', key: 'handler_name', width: 100,
      render: (_, r) => r.handler_name || <Tag color="orange">公共池</Tag>,
    },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (_, r) => <Tag color={getStatusColor(r.status)}>{getStatusText(r.status)}</Tag>,
    },
    { title: '派发时间', dataIndex: 'dispatched_at', key: 'dispatched_at', width: 160, valueType: 'dateTime', sorter: true },
    { title: '完成时间', dataIndex: 'completed_at', key: 'completed_at', width: 160, valueType: 'dateTime' },
    { title: '操作', key: 'actions', width: 120, hideInSearch: true,
      render: (_, r) => (
        <Space>
          <RefButton type="link" size="small" icon={<EyeOutlined />}
            onClick={() => navigate(`/my-dispatched/${r.id}`)}>查看</RefButton>
        </Space>
      ),
    },
  ], [navigate]);

  const requestFn = async (params: PageParams) => {
    const result = await getDispatchedOrders({ ...params, module_code: currentModule });
    return { data: result.list, success: true, total: result.total };
  };

  const handleBatchOk = async () => {
    const values = await batchForm.validateFields();
    const remark = String(values.remark || '').trim();
    const ids = selectedRows.filter((row) => row.module_code === currentModule && row.status !== 'completed').map((row) => row.id);
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
    <PageContainer header={{ title: getModuleTitle(currentModule), subTitle: `按模块筛选 · ${getModuleLabel(currentModule)}` }}>
      {isSocialModule && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="社保公积金办理说明"
          description="本列表仅展示社保公积金办理子工单。批量完成时备注必填，请记录月份、社保/公积金基数、操作类型和异常情况，便于后续追溯。"
        />
      )}
      <ProTable<DispatchedOrderItem>
        key={currentModule}
        actionRef={actionRef}
        columns={columns}
        request={requestFn}
        rowKey="id"
        search={{ labelWidth: 'auto' }}
        headerTitle={`${getModuleLabel(currentModule)}列表`}
        options={false}
        toolBarRender={() => canBatchComplete ? [
          <Button
            key="batch"
            type="primary"
            icon={<CheckCircleOutlined />}
            disabled={selectedRows.length === 0}
            onClick={() => { batchForm.resetFields(); setBatchOpen(true); }}
          >
            批量完成
          </Button>,
        ] : []}
        rowSelection={canBatchComplete ? {
          selectedRowKeys: selectedRows.map((row) => row.id),
          onChange: (_keys, rows) => setSelectedRows(rows),
          getCheckboxProps: (record) => ({ disabled: record.status === 'completed' }),
        } : undefined}
        tableAlertRender={canBatchComplete ? ({ selectedRowKeys, selectedRows: alertSelectedRows, onCleanSelected }) => {
          const completable = (alertSelectedRows as DispatchedOrderItem[]).filter((row) => row.status !== 'completed');
          return (
            <Space>
              <span>已选 {selectedRowKeys.length} 项</span>
              <Button size="small" onClick={() => { onCleanSelected(); setSelectedRows([]); }}>取消</Button>
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
            </Space>
          );
        } : false}
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
        dateFormatter="string"
      />

      <Modal
        title={`批量完成${getModuleLabel(currentModule)}子工单`}
        open={batchOpen}
        onOk={handleBatchOk}
        onCancel={() => setBatchOpen(false)}
        confirmLoading={batchLoading}
        okText="确认完成"
        destroyOnHidden
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={`已选择 ${selectedRows.length} 条子工单`}
          description={isSocialModule ? '备注必填，请填写办理月份、社保基数、公积金基数、操作类型（新增/调整/停缴等）和异常说明。' : '备注必填，请填写本次批量完成的处理说明，便于后续追溯。'}
        />
        <Form form={batchForm} layout="vertical">
          <Form.Item
            name="remark"
            label="办理备注"
            rules={[
              { required: true, message: '请填写办理备注' },
              { validator: (_, value) => String(value || '').trim() ? Promise.resolve() : Promise.reject(new Error('办理备注不能只填空格')) },
            ]}
          >
            <Input.TextArea rows={4} maxLength={500} showCount placeholder={isSocialModule ? SOCIAL_REMARK_PLACEHOLDER : '请填写本次批量完成的处理说明'} />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default OnboardingModule;
