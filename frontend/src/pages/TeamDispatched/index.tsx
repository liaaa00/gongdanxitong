import { useEffect, useRef, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import type { ProColumns, ActionType } from '@ant-design/pro-components';
import { ProTable } from '@ant-design/pro-components';
import { Button, Tag, Space, App, Select, Modal, Alert, Input, Popconfirm } from 'antd';
import { EyeOutlined, UserSwitchOutlined, ExportOutlined, TeamOutlined, UserOutlined, CheckCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import { getDispatchedOrders, reassignDispatchedOrder, batchExportDispatchedOrders, batchCompleteDispatchedOrders, deleteDispatchedOrder, batchDeleteDispatchedOrders } from '@/services/dispatchedOrders';
import type { DispatchedOrderItem } from '@/services/dispatchedOrders';
import { getExportTemplates } from '@/services/exportTemplates';
import type { ExportTemplateItem } from '@/services/exportTemplates';
import type { PageParams } from '@/services/mock';
import { useAuth } from '@/hooks/useAuth';
import { getModuleLabel } from '@/constants/modules';
import { getStatusColor, getStatusText } from '@/constants/dictionaries';

const TeamDispatched: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { hasRole, user } = useAuth();
  const isBusinessOwner = hasRole('business_owner');
  const isGroupLeader = hasRole('business_group_leader');
  const isSharedTeamOwner = hasRole('shared_team_owner');
  const isAdmin = hasRole('admin');
  const actionRef = useRef<ActionType>();
  const [reassignId, setReassignId] = useState<string | null>(null);
  const [reassignHandler, setReassignHandler] = useState('');
  const [exportVisible, setExportVisible] = useState(false);
  const [exportIds, setExportIds] = useState<string[]>([]);
  const [exportTemplates, setExportTemplates] = useState<ExportTemplateItem[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [batchCompleteVisible, setBatchCompleteVisible] = useState(false);
  const [batchCompleteIds, setBatchCompleteIds] = useState<string[]>([]);
  const [batchCompleteRemark, setBatchCompleteRemark] = useState('');
  const [batchCompleteLoading, setBatchCompleteLoading] = useState(false);
  const [batchCleanFn, setBatchCleanFn] = useState<(() => void) | null>(null);

  const handleReassign = async () => {
    if (!reassignId) return;
    try {
      await reassignDispatchedOrder(reassignId, reassignHandler);
      message.success('已重新分派');
      setReassignId(null);
      setReassignHandler('');
      actionRef.current?.reload();
    } catch {
      message.error('分派失败');
    }
  };

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
      if (skipped > 0) {
        message.warning(`成功完成 ${res.completed} 条，${skipped} 条跳过`);
      } else {
        message.success(`已批量完成 ${res.completed} 条子工单`);
      }
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

  const handleBatchExport = async () => {
    try {
      const blob = await batchExportDispatchedOrders(exportIds, selectedTemplate || undefined);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '批量导出部门子工单.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
      message.success('导出成功');
      setExportVisible(false);
    } catch {
      message.error('导出失败');
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

  const columns: ProColumns<DispatchedOrderItem>[] = useMemo(
    () => [
      { title: '单号', dataIndex: 'order_no', key: 'order_no', width: 150, copyable: true },
      {
        title: '模块', dataIndex: 'module_code', key: 'module_code', width: 140,
        render: (_, record) => getModuleLabel(record.module_code),
      },
      { title: '员工', dataIndex: 'employee_name', key: 'employee_name', width: 90 },
      { title: '客户', dataIndex: 'customer_name', key: 'customer_name', width: 120 },
      {
        title: '状态', dataIndex: 'status', key: 'status', width: 90,
        render: (_, record) => <Tag color={getStatusColor(record.status)}>{getStatusText(record.status)}</Tag>,
      },
      {
        title: '处理人', dataIndex: 'handler_name', key: 'handler_name', width: 100,
        render: (_, record) => record.handler_name || <Tag color="orange">公共池</Tag>,
      },
      { title: '指派时间', dataIndex: 'dispatched_at', key: 'dispatched_at', width: 140, valueType: 'dateTime' },
      {
        title: '操作', key: 'actions', width: 180, hideInSearch: true,
        render: (_, record) => (
          <Space>
            <Button type="link" size="small" icon={<EyeOutlined />}
              onClick={() => navigate('/my-dispatched/' + record.id)}>详情</Button>
            {record.status !== 'completed' && record.status !== 'returned' && (
              <Button type="link" size="small" icon={<UserSwitchOutlined />}
                onClick={() => setReassignId(record.id)}>重新分派</Button>
            )}
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
    ],
    [navigate, isAdmin],
  );

  return (
    <PageContainer header={{ title: '部门子工单管理', subTitle: isBusinessOwner ? '全量业务工单视图' : isSharedTeamOwner ? '共享团队工单视图' : '本部门工单视图（组长可见）' }}>
      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        icon={isBusinessOwner ? <TeamOutlined /> : <UserOutlined />}
        message={
          isBusinessOwner
            ? '业务负责人视角 — 可查看全部业务团队的子工单（只读）'
            : isSharedTeamOwner
              ? '共享团队负责人视角 — 可管理合同签订和入离职联系模块'
              : isGroupLeader
                ? `业务组长视角 — 「${user?.roles?.[0]?.name || '本组'}」子工单`
                : '团队子工单管理 — 仅显示你所在团队的工单'
        }
      />
      <ProTable<DispatchedOrderItem>
        actionRef={actionRef}
        columns={columns}
        request={async (params: PageParams) => {
          const result = await getDispatchedOrders({ ...params });
          return { data: result.list, success: true, total: result.total };
        }}
        rowKey="id"
        search={{ labelWidth: 'auto' }}
        headerTitle="本部门子工单（主管可见）"
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
        dateFormatter="string"
        rowSelection={{
          getCheckboxProps: (record) => ({
            disabled: record.status === 'completed',
          }),
        }}
        tableAlertRender={({ selectedRowKeys, selectedRows, onCleanSelected }) => {
          const completable = (selectedRows as DispatchedOrderItem[]).filter(
            (r) => r.status !== 'completed',
          );
          return (
            <Space>
              <span>已选 {selectedRowKeys.length} 项</span>
              <Button size="small" onClick={onCleanSelected}>取消</Button>
              <Button
                size="small"
                type="primary"
                icon={<CheckCircleOutlined />}
                disabled={completable.length === 0}
                onClick={() => {
                  setBatchCompleteIds(completable.map((r) => r.id));
                  setBatchCompleteRemark('');
                  setBatchCleanFn(() => onCleanSelected);
                  setBatchCompleteVisible(true);
                }}
              >
                批量完成{completable.length > 0 ? `（${completable.length}）` : ''}
              </Button>
              <Button size="small" icon={<ExportOutlined />}
                onClick={async () => {
                  setExportIds(selectedRowKeys as string[]);
                  const tpls = await getExportTemplates();
                  setExportTemplates(tpls);
                  setSelectedTemplate(tpls[0]?.id || '');
                  setExportVisible(true);
                }}>
                批量导出
              </Button>
              {isAdmin && (
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleBatchDelete(selectedRowKeys.map(String), onCleanSelected)}
                >
                  批量删除
                </Button>
              )}
            </Space>
          );
        }}
      />

      <Modal title="重新分派" open={!!reassignId} onOk={handleReassign}
        onCancel={() => { setReassignId(null); setReassignHandler(''); }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <span>选择新处理人：</span>
          <Select style={{ width: '100%' }} value={reassignHandler}
            onChange={setReassignHandler} placeholder="选择处理人"
            options={[
              { label: '合同专员甲', value: 'user-contract' },
              { label: '合同专员乙', value: 'user-contract-b' },
              { label: '录入专员甲', value: 'user-data-entry' },
              { label: '社保专员甲', value: 'user-social' },
              { label: '退回公共池', value: '' },
            ]} />
        </Space>
      </Modal>

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
          <Alert
            type="info"
            showIcon
            message={`将批量完成 ${batchCompleteIds.length} 条子工单，已完成的子单已自动跳过。`}
          />
          <span>批量完成备注（必填）：</span>
          <Input.TextArea
            rows={4}
            value={batchCompleteRemark}
            onChange={(e) => setBatchCompleteRemark(e.target.value)}
            placeholder="请输入批量完成原因，例如：本批次合同已全部签署确认"
            maxLength={1024}
            showCount
          />
        </Space>
      </Modal>

      <Modal title="批量导出" open={exportVisible}
        onOk={handleBatchExport} onCancel={() => setExportVisible(false)} width={500}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <span>已选择 {exportIds.length} 项。选择导出模板：</span>
          <Select style={{ width: '100%' }} value={selectedTemplate}
            onChange={setSelectedTemplate}
            options={exportTemplates.map((t) => ({
              label: t.template_name + '（' + (t.field_list?.length || 0) + ' 个字段）',
              value: t.id,
            }))} />
        </Space>
      </Modal>
    </PageContainer>
  );
};

export default TeamDispatched;
