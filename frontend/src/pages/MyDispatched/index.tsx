import { forwardRef, useRef, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import type { ProColumns, ActionType } from '@ant-design/pro-components';
import { ProTable } from '@ant-design/pro-components';
import { Button, Tag, Space, App, Modal, Select, Badge, Form, Input, Tooltip } from 'antd';
import {
  CheckCircleOutlined, EyeOutlined, ExportOutlined, ClockCircleOutlined,
  UserSwitchOutlined, WarningOutlined,
} from '@ant-design/icons';
import {
  getDispatchedOrders,
  acceptDispatchedOrder,
  batchExportDispatchedOrders,
  reassignDispatchedOrder,
} from '@/services/dispatchedOrders';
import type { DispatchedOrderItem } from '@/services/dispatchedOrders';
import { getExportTemplates } from '@/services/exportTemplates';
import type { ExportTemplateItem } from '@/services/exportTemplates';
import type { PageParams } from '@/services/mock';
import { getUsersByTeam } from '@/services/users';
import type { UserItem } from '@/services/users';
import { getModuleLabel } from '@/constants/modules';
import { getStatusColor, getStatusText } from '@/constants/dictionaries';

const RefButton = forwardRef<HTMLButtonElement, React.ComponentProps<typeof Button>>((props, ref) => (
  <Button ref={ref} {...props} />
));
RefButton.displayName = 'RefButton';

const getSelectPopupContainer = (triggerNode: HTMLElement) => triggerNode.parentElement || document.body;

function getSlaStatus(dispatchedAt: string | null, status: string, dueAt?: string | null): { label: string; color: string; overdue: boolean } | null {
  if (status === 'completed' || status === 'returned') return null;
  if (dueAt) {
    const remainHours = (new Date(dueAt).getTime() - Date.now()) / (1000 * 60 * 60);
    if (remainHours < 0) return { label: '已超期', color: '#000', overdue: true };
    if (remainHours < 4) return { label: `${remainHours.toFixed(1)}h`, color: '#ff4d4f', overdue: false };
  }
  if (!dispatchedAt) return null;
  const elapsed = Date.now() - new Date(dispatchedAt).getTime();
  const hours = elapsed / (1000 * 60 * 60);
  if (hours > 24) return { label: '已超期', color: '#000', overdue: true };
  if (hours < 2) return { label: hours < 0 ? '即将' : hours.toFixed(1) + 'h', color: '#ff4d4f', overdue: false };
  if (hours < 8) return { label: hours.toFixed(1) + 'h', color: '#faad14', overdue: false };
  return null;
}

function getTeamCode(record?: DispatchedOrderItem | null) {
  return record?.team_code || record?.module_code || 'shared_team';
}

const MyDispatched: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const actionRef = useRef<ActionType>();
  const [exportVisible, setExportVisible] = useState(false);
  const [exportIds, setExportIds] = useState<string[]>([]);
  const [exportTemplates, setExportTemplates] = useState<ExportTemplateItem[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [exporting, setExporting] = useState(false);
  const [slaWarnCount, setSlaWarnCount] = useState(0);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<DispatchedOrderItem | null>(null);
  const [teamUsers, setTeamUsers] = useState<UserItem[]>([]);
  const [reassignLoading, setReassignLoading] = useState(false);
  const [reassignForm] = Form.useForm<{ handlerId: string; reason: string }>();

  const handleAccept = async (id: string) => {
    try {
      await acceptDispatchedOrder(id);
      message.success('已接单');
      actionRef.current?.reload();
    } catch { message.error('接单失败'); }
  };

  const openReassign = async (record: DispatchedOrderItem) => {
    setReassignTarget(record);
    setReassignOpen(true);
    reassignForm.resetFields();
    try {
      const users = await getUsersByTeam(getTeamCode(record));
      setTeamUsers(users.filter((u) => u.id !== record.handler_id));
    } catch {
      setTeamUsers([]);
      message.warning('同组成员加载失败，可稍后重试');
    }
  };

  const handleReassign = async () => {
    if (!reassignTarget) return;
    const values = await reassignForm.validateFields();
    setReassignLoading(true);
    try {
      await reassignDispatchedOrder(reassignTarget.id, values.handlerId, values.reason.trim());
      message.success('转交成功');
      setReassignOpen(false);
      setReassignTarget(null);
      actionRef.current?.reload();
    } catch {
      message.error('转交失败');
    } finally {
      setReassignLoading(false);
    }
  };

  const handleBatchExport = async () => {
    setExporting(true);
    try {
      const blob = await batchExportDispatchedOrders(exportIds, selectedTemplate || undefined);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = '批量导出子工单.xlsx'; a.click();
      window.URL.revokeObjectURL(url);
      message.success('导出成功'); setExportVisible(false);
    } catch { message.error('导出失败'); }
    finally { setExporting(false); }
  };

  const columns: ProColumns<DispatchedOrderItem>[] = useMemo(() => [
    { title: '主工单号', dataIndex: 'order_no', key: 'order_no', width: 150, copyable: true },
    { title: '节点类型', dataIndex: 'module_code', key: 'module_code', width: 160,
      render: (_, r) => (
        <Space size={4} wrap>
          {r.has_unread_dirty && <Badge color="red" />}
          <Tag color="blue">{getModuleLabel(r.module_code)}</Tag>
          {r.node_type && r.node_type !== r.module_code && <Tag>{r.node_type}</Tag>}
          {r.has_unread_dirty && <Tag color="red">字段变更</Tag>}
        </Space>
      ),
    },
    { title: '员工', dataIndex: 'employee_name', key: 'employee_name', width: 90 },
    { title: '客户', dataIndex: 'customer_name', key: 'customer_name', width: 120, ellipsis: true },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (_, record) => <Tag color={getStatusColor(record.status)}>{getStatusText(record.status)}</Tag>,
    },
    {
      title: '超期预警', key: 'sla', width: 110, hideInSearch: true,
      render: (_, record) => {
        const sla = getSlaStatus(record.dispatched_at, record.status, record.due_at);
        if (!sla) return <span style={{ color: '#ccc' }}>-</span>;
        return (
          <Tooltip title={sla.overdue ? '该待办已超过处理时限' : '请关注处理时限'}>
            <Tag color={sla.color} icon={sla.overdue ? <WarningOutlined /> : <ClockCircleOutlined />}>{sla.label}</Tag>
          </Tooltip>
        );
      },
    },
    { title: '处理人', dataIndex: 'handler_name', key: 'handler_name', width: 120,
      render: (_, r) => r.handler_name || <Tag color="orange">公共池</Tag>,
    },
    { title: '派发时间', dataIndex: 'dispatched_at', key: 'dispatched_at', width: 150, valueType: 'dateTime' },
    {
      title: '操作', key: 'actions', width: 210, hideInSearch: true,
      render: (_, record) => (
        <Space wrap>
          {record.status === 'pending' && (
            <RefButton type="primary" size="small" icon={<CheckCircleOutlined />} onClick={() => handleAccept(record.id)}>接单</RefButton>
          )}
          {record.status !== 'completed' && record.status !== 'returned' && (
            <RefButton size="small" icon={<UserSwitchOutlined />} onClick={() => openReassign(record)}>转交</RefButton>
          )}
          <RefButton type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate('/my-dispatched/' + record.id)}>详情</RefButton>
        </Space>
      ),
    },
  ], [navigate]);

  return (
    <PageContainer header={{
      title: '我的子工单',
      extra: slaWarnCount > 0 ? [
        <Badge key="sla" count={slaWarnCount}><Tag color="red" icon={<ClockCircleOutlined />}>服务时限预警</Tag></Badge>,
      ] : undefined,
    }}>
      <ProTable<DispatchedOrderItem>
        actionRef={actionRef} columns={columns} rowKey="id"
        request={async (params: PageParams) => {
          const result = await getDispatchedOrders({ ...params });
          const warnCount = result.list.filter((d) => {
            const sla = getSlaStatus(d.dispatched_at, d.status, d.due_at);
            return sla && (sla.color === '#ff4d4f' || sla.color === '#000');
          }).length;
          setSlaWarnCount(warnCount);
          return { data: result.list, success: true, total: result.total };
        }}
        search={{ labelWidth: 'auto' }} headerTitle="待办子工单"
        options={false}
        toolBarRender={false}
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
        dateFormatter="string"
        rowSelection={{}}
        tableAlertRender={({ selectedRowKeys, onCleanSelected }) => (
          <Space>
            <span>已选 {selectedRowKeys.length} 项</span>
            <RefButton size="small" onClick={onCleanSelected}>取消</RefButton>
            <RefButton size="small" type="primary" icon={<ExportOutlined />}
              onClick={async () => {
                setExportIds(selectedRowKeys as string[]);
                const tpls = await getExportTemplates();
                setExportTemplates(tpls);
                setSelectedTemplate(tpls[0]?.id || '');
                setExportVisible(true);
              }}>批量导出</RefButton>
          </Space>
        )}
      />
      <Modal title="批量导出" open={exportVisible} onOk={handleBatchExport}
        onCancel={() => setExportVisible(false)} confirmLoading={exporting} width={500}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <span>已选 {exportIds.length} 项。请选择导出模板：</span>
          <Select style={{ width: '100%' }} value={selectedTemplate} onChange={setSelectedTemplate}
            getPopupContainer={getSelectPopupContainer}
            options={exportTemplates.map((t) => ({ label: t.template_name + '（' + (t.field_list?.length || 0) + ' 个字段）', value: t.id }))} />
        </Space>
      </Modal>
      <Modal title="转交待办" open={reassignOpen} onOk={handleReassign}
        onCancel={() => { setReassignOpen(false); setReassignTarget(null); }}
        confirmLoading={reassignLoading} destroyOnHidden>
        <Form form={reassignForm} layout="vertical">
          <Form.Item label="当前节点">
            <Space wrap>
              <Tag>{reassignTarget?.order_no}</Tag>
              <Tag color="blue">{getModuleLabel(reassignTarget?.module_code)}</Tag>
              <span>{reassignTarget?.handler_name || '公共池'}</span>
            </Space>
          </Form.Item>
          <Form.Item name="handlerId" label="转交给" rules={[{ required: true, message: '请选择同组成员' }]}>
            <Select
              showSearch
              placeholder="请选择同组成员"
              optionFilterProp="label"
              getPopupContainer={getSelectPopupContainer}
              options={teamUsers.map((u) => ({ label: `${u.real_name || u.username}（${u.group_name || u.department_name || '同组'}）`, value: u.id }))}
            />
          </Form.Item>
          <Form.Item
            name="reason"
            label="转交原因"
            rules={[
              { required: true, message: '请填写转交原因' },
              { validator: (_, value) => String(value || '').trim() ? Promise.resolve() : Promise.reject(new Error('转交原因不能只填空格')) },
            ]}
          >
            <Input.TextArea rows={3} maxLength={200} showCount placeholder="例如：办理人请假，转交备用同事代办" />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default MyDispatched;
