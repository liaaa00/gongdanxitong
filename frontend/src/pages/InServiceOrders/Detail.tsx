import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  Select,
  Space,
  Steps,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  EditOutlined,
  FileDoneOutlined,
  GlobalOutlined,
  HomeOutlined,
  ReloadOutlined,
  StopOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { ROLE, canonicalRoleCodes } from '@/constants/roles';
import { useUserStore } from '@/stores/userStore';
import {
  IN_SERVICE_HANDLE_CHANNEL_META,
  IN_SERVICE_ORDER_KINDS,
  IN_SERVICE_ORDER_KIND_META,
  IN_SERVICE_STATUS_META,
  getInServiceCategoryPath,
} from '@/constants/inService';
import InServiceOrderForm, {
  AttachmentField,
  normalizeInServiceOrderFormValues,
  type InServiceOrderFormValues,
} from './components/InServiceOrderForm';
import {
  acceptInServiceOrder,
  cancelInServiceOrder,
  completeInServiceOrder,
  confirmInServiceOrder,
  downloadInServiceCertificate,
  exportInServiceRenewalTemplate,
  failInServiceOrder,
  getInServiceOrder,
  requestInServiceMaterialChange,
  requestInServiceOrderInfo,
  resubmitInServiceOrder,
  reviewInServiceMaterialChange,
  startInServiceProcessing,
  transferInServiceOrder,
  type InServiceMaterialChangeRequest,
  type InServiceOrder,
} from '@/services/inServiceOrders';
import { downloadDispatchedExport } from '@/services/dispatchedOrders';
import { getUsers, type UserItem } from '@/services/users';

function formatDate(value?: string | null) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-';
}

function getListPath(order: InServiceOrder): string {
  if (order.orderKind === IN_SERVICE_ORDER_KINDS.CONTRACT_RENEWAL) return '/renewal';
  if (order.orderKind === IN_SERVICE_ORDER_KINDS.CERTIFICATE) return '/in-service/certificates';
  if (order.orderKind === IN_SERVICE_ORDER_KINDS.RESIGNATION_CERTIFICATE) return '/resignation-certificates';
  if (order.orderKind === IN_SERVICE_ORDER_KINDS.OUT_OF_PROVINCE_INCREASE) return '/out-of-province/increase';
  if (order.orderKind === IN_SERVICE_ORDER_KINDS.OUT_OF_PROVINCE_DECREASE) return '/out-of-province/decrease';
  return order.businessScope === 'out_of_province' ? '/out-of-province/single-business' : '/in-service';
}

function getMaterialChangeRequest(order: InServiceOrder): InServiceMaterialChangeRequest | null {
  const raw = order.extraData?.__materialChangeRequest;
  if (!raw || typeof raw !== 'object' || !raw.changes) return null;
  return raw as InServiceMaterialChangeRequest;
}

function getDisplayedFormValues(order: InServiceOrder): InServiceOrderFormValues {
  const request = getMaterialChangeRequest(order);
  if (!request) return order as InServiceOrderFormValues;
  return {
    ...order,
    ...request.changes,
    extraData: {
      ...order.extraData,
      ...(request.changes.extraData || {}),
    },
  } as InServiceOrderFormValues;
}

function useRoleFlags(order?: InServiceOrder | null) {
  const { user } = useUserStore();
  return useMemo(() => {
    const roles = canonicalRoleCodes(user?.roles);
    const isAdmin = roles.includes(ROLE.ADMIN);
    const isCreator = Boolean(order?.createdBy && user?.id === order.createdBy);
    const isHandler = Boolean(order?.handlerId && user?.id === order.handlerId);
    const isManager = isAdmin
      || roles.includes(ROLE.BUSINESS_OWNER)
      || roles.includes(ROLE.SHARED_TEAM_OWNER);
    return { isCreator, isHandler, isManager };
  }, [order?.createdBy, order?.handlerId, user?.id, user?.roles]);
}

interface OutcomeValue {
  remark: string;
  attachments: string[];
}

function OutcomeFields({ onChange }: { onChange: (value: OutcomeValue) => void }) {
  const [value, setValue] = useState<OutcomeValue>({ remark: '', attachments: [] });
  const update = (patch: Partial<OutcomeValue>) => {
    const next = { ...value, ...patch };
    setValue(next);
    onChange(next);
  };
  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Input.TextArea
        aria-label="办理结果备注"
        rows={4}
        maxLength={512}
        showCount
        placeholder="填写办理结果或失败原因"
        onChange={(event) => update({ remark: event.currentTarget.value })}
      />
      <AttachmentField
        value={value.attachments}
        onChange={(attachments) => update({ attachments })}
      />
    </Space>
  );
}

interface TransferValue {
  handlerId: string;
  reason: string;
}

function TransferFields({ onChange }: { onChange: (value: TransferValue) => void }) {
  const { message } = App.useApp();
  const [options, setOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [value, setValue] = useState<TransferValue>({ handlerId: '', reason: '' });

  useEffect(() => {
    getUsers({ page: 1, pageSize: 100, isActive: true })
      .then((result) => {
        const list = Array.isArray(result) ? result : result.list || [];
        setOptions(list.map((user: UserItem) => ({
          value: user.id,
          label: `${user.real_name || user.realName || user.username}（${user.username}）`,
        })));
      })
      .catch(() => message.error('加载可转派人员失败'))
      .finally(() => setLoading(false));
  }, [message]);

  const update = (patch: Partial<TransferValue>) => {
    const next = { ...value, ...patch };
    setValue(next);
    onChange(next);
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Select
        showSearch
        optionFilterProp="label"
        loading={loading}
        options={options}
        placeholder="选择新的办理人"
        onChange={(handlerId) => update({ handlerId })}
      />
      <Input.TextArea
        rows={3}
        maxLength={512}
        showCount
        placeholder="填写转派原因（可选）"
        onChange={(event) => update({ reason: event.currentTarget.value })}
      />
    </Space>
  );
}

function buildTimelineItems(order: InServiceOrder) {
  const rows = [
    { label: '创建并自动派单', time: order.dispatchedAt || order.createdAt, note: order.createdByName || order.createdBy },
    { label: '受理', time: order.acceptedAt, note: order.handlerName || order.handlerId || undefined },
    { label: '完成材料初审', time: order.confirmedAt },
    { label: IN_SERVICE_HANDLE_CHANNEL_META[order.handleChannel].label, time: order.processingAt },
    { label: '要求补充材料', time: order.pendingInfoAt, note: order.pendingInfoReason || undefined },
    {
      label: order.status === 'failed' ? '办理失败' : '办理成功',
      time: order.completedAt,
      note: order.completionRemark || undefined,
    },
    { label: order.status === 'cancelled' ? '订单取消' : '归档', time: order.closedAt, note: order.closeReason || undefined },
    ...order.transferHistory.map((item) => ({
      label: '转派',
      time: item.transferredAt,
      note: item.reason || `转派至 ${item.toHandlerId}`,
    })),
  ];
  return rows
    .filter((item) => item.time)
    .sort((left, right) => dayjs(left.time).valueOf() - dayjs(right.time).valueOf())
    .map((item) => ({
      children: (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{item.label}</Typography.Text>
          <Typography.Text type="secondary">{formatDate(item.time)}</Typography.Text>
          {item.note ? <Typography.Text>{item.note}</Typography.Text> : null}
        </Space>
      ),
    }));
}

function currentStep(order: InServiceOrder): number {
  if (['completed', 'failed', 'cancelled', 'archived'].includes(order.status)) return 4;
  if (order.status === 'processing') return 3;
  if (order.status === 'pending_info') {
    return order.pendingReturnStatus === 'processing' ? 3 : 2;
  }
  if (['accepted', 'ready'].includes(order.status)) return 2;
  if (order.status === 'dispatched') return 1;
  return 0;
}

export default function InServiceOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<InServiceOrderFormValues>();
  const [order, setOrder] = useState<InServiceOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [materialChangeEditing, setMaterialChangeEditing] = useState(false);
  const roleFlags = useRoleFlags(order);

  const loadOrder = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await getInServiceOrder(id);
      setOrder(data);
      form.setFieldsValue(getDisplayedFormValues(data));
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载单项业务失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOrder();
  }, [id]);

  const runAction = async (label: string, action: () => Promise<InServiceOrder>) => {
    setActionLoading(true);
    try {
      const next = await action();
      setOrder(next);
      form.setFieldsValue(getDisplayedFormValues(next));
      setMaterialChangeEditing(false);
      message.success(label + '成功');
    } catch (error) {
      message.error(error instanceof Error ? error.message : label + '失败');
    } finally {
      setActionLoading(false);
    }
  };

  const askReason = (
    title: string,
    label: string,
    action: (reason: string) => Promise<InServiceOrder>,
  ) => {
    let reason = '';
    modal.confirm({
      title,
      content: (
        <Input.TextArea
          aria-label={title + '原因'}
          rows={4}
          maxLength={512}
          showCount
          placeholder="请输入操作原因"
          onChange={(event) => { reason = event.currentTarget.value; }}
        />
      ),
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        if (!reason.trim()) {
          message.warning('请输入操作原因');
          return Promise.reject(new Error('reason required'));
        }
        await runAction(label, () => action(reason.trim()));
      },
    });
  };

  const askOutcome = (success: boolean) => {
    let value: OutcomeValue = { remark: '', attachments: [] };
    const label = success ? '办理成功' : '办理失败';
    modal.confirm({
      title: label,
      content: <OutcomeFields onChange={(next) => { value = next; }} />,
      okText: '确认提交',
      cancelText: '取消',
      okButtonProps: success ? undefined : { danger: true },
      onOk: () => runAction(
        label,
        () => success
          ? completeInServiceOrder(order!.id, value.remark, value.attachments)
          : failInServiceOrder(order!.id, value.remark, value.attachments),
      ),
    });
  };

  const askTransfer = () => {
    let value: TransferValue = { handlerId: '', reason: '' };
    modal.confirm({
      title: '转派工单',
      content: <TransferFields onChange={(next) => { value = next; }} />,
      okText: '确认转派',
      cancelText: '取消',
      onOk: async () => {
        if (!value.handlerId) {
          message.warning('请选择新的办理人');
          return Promise.reject(new Error('handler required'));
        }
        await runAction('转派', () => transferInServiceOrder(order!.id, value.handlerId, value.reason));
      },
    });
  };

  if (loading) return <PageContainer loading />;
  if (!order) {
    return (
      <PageContainer header={{ title: '单项业务详情' }}>
        <Empty description="工单不存在" />
      </PageContainer>
    );
  }

  const statusMeta = IN_SERVICE_STATUS_META[order.status] || { label: order.status, color: 'default' };
  const channelMeta = IN_SERVICE_HANDLE_CHANNEL_META[order.handleChannel];
  const materialChangeRequest = getMaterialChangeRequest(order);
  const canEditPendingInfo = (roleFlags.isCreator || roleFlags.isManager) && order.status === 'pending_info';
  const canEdit = canEditPendingInfo || materialChangeEditing;
  const canRequestMaterialChange = roleFlags.isCreator
    && ['accepted', 'processing'].includes(order.status)
    && !materialChangeRequest;
  const canHandle = roleFlags.isHandler || roleFlags.isManager;
  const canCancel = roleFlags.isCreator
    && !['completed', 'failed', 'cancelled', 'archived'].includes(order.status);
  const orderMeta = IN_SERVICE_ORDER_KIND_META[order.orderKind];
  const listPath = getListPath(order);

  const handleMaterialChangeRequest = async () => {
    try {
      const values = normalizeInServiceOrderFormValues(await form.validateFields(), order.orderKind);
      await runAction('提交材料修改申请', () => requestInServiceMaterialChange(order.id, values));
    } catch (error) {
      if ((error as { errorFields?: unknown[] })?.errorFields) message.error('请检查表单必填项');
    }
  };

  const handleResubmit = async () => {
    try {
      const values = normalizeInServiceOrderFormValues(await form.validateFields(), order.orderKind);
      await runAction('补充材料并重新提交', () => resubmitInServiceOrder(order.id, values));
    } catch (error) {
      if ((error as { errorFields?: unknown[] })?.errorFields) message.error('请检查表单必填项');
    }
  };

  const actionButtons = [
    <Button key="back" icon={<ArrowLeftOutlined />} onClick={() => navigate(listPath)}>
      返回列表
    </Button>,
  ];

  if (order.orderKind === IN_SERVICE_ORDER_KINDS.CONTRACT_RENEWAL && canHandle) {
    actionButtons.push(
      <Button
        key="download-renewal-template"
        icon={<DownloadOutlined />}
        loading={actionLoading}
        onClick={async () => {
          setActionLoading(true);
          try {
            const result = await exportInServiceRenewalTemplate(order.id);
            await downloadDispatchedExport(result, `劳动合同续签-${order.orderNo}.xlsx`);
            message.success('续签合同模板已导出');
          } catch (error) {
            message.error(error instanceof Error ? error.message : '续签合同模板导出失败');
          } finally {
            setActionLoading(false);
          }
        }}
      >
        导出续签模板
      </Button>,
    );
  }

  if (order.orderKind === IN_SERVICE_ORDER_KINDS.CERTIFICATE && canHandle) {
    actionButtons.push(
      <Button
        key="download-certificate"
        icon={<DownloadOutlined />}
        loading={actionLoading}
        onClick={async () => {
          setActionLoading(true);
          try {
            await downloadInServiceCertificate(order.id, order.orderNo);
            message.success('证明模板已导出');
          } catch (error) {
            message.error(error instanceof Error ? error.message : '证明模板导出失败');
          } finally {
            setActionLoading(false);
          }
        }}
      >
        导出标准模板
      </Button>,
    );
  }
  if (canEditPendingInfo) {
    actionButtons.push(
      <Button key="resubmit" type="primary" icon={<ReloadOutlined />} loading={actionLoading} onClick={handleResubmit}>
        补充材料并提交
      </Button>,
    );
  }
  if (canRequestMaterialChange && !materialChangeEditing) {
    actionButtons.push(
      <Button key="request-material-change" icon={<EditOutlined />} onClick={() => {
        form.setFieldsValue(order);
        setMaterialChangeEditing(true);
      }}>
        申请修改材料
      </Button>,
    );
  }
  if (materialChangeEditing) {
    actionButtons.push(
      <Button key="submit-material-change" type="primary" icon={<CheckOutlined />} loading={actionLoading} onClick={handleMaterialChangeRequest}>
        提交修改申请
      </Button>,
      <Button key="cancel-material-change" onClick={() => {
        form.setFieldsValue(order);
        setMaterialChangeEditing(false);
      }}>
        取消编辑
      </Button>,
    );
  }
  if (materialChangeRequest && canHandle) {
    actionButtons.push(
      <Button key="approve-material-change" type="primary" icon={<CheckOutlined />} loading={actionLoading}
        onClick={() => runAction('批准材料修改', () => reviewInServiceMaterialChange(order.id, true))}>
        批准修改
      </Button>,
      <Button key="reject-material-change" danger icon={<CloseCircleOutlined />} loading={actionLoading}
        onClick={() => askReason('驳回材料修改', '驳回材料修改', (reason) => reviewInServiceMaterialChange(order.id, false, reason))}>
        驳回修改
      </Button>,
    );
  }
  if (order.status === 'dispatched' && canHandle) {
    actionButtons.push(
      <Button key="accept" type="primary" icon={<CheckOutlined />} loading={actionLoading}
        onClick={() => runAction('受理', () => acceptInServiceOrder(order.id))}>
        受理
      </Button>,
      <Button key="transfer" icon={<SwapOutlined />} loading={actionLoading} onClick={askTransfer}>
        转派
      </Button>,
    );
  }
  if (order.status === 'accepted' && canHandle && !materialChangeRequest) {
    actionButtons.push(
      <Button key="confirm" type="primary" icon={<FileDoneOutlined />} loading={actionLoading}
        onClick={() => runAction('材料确认', () => confirmInServiceOrder(order.id))}>
        材料确认
      </Button>,
      <Button key="missing" icon={<ReloadOutlined />} loading={actionLoading}
        onClick={() => askReason('退回补充材料', '退回补料', (reason) => requestInServiceOrderInfo(order.id, reason))}>
        退回补料
      </Button>,
      <Button key="transfer" icon={<SwapOutlined />} loading={actionLoading} onClick={askTransfer}>
        转派
      </Button>,
    );
  }
  if (order.status === 'ready' && canHandle && !materialChangeRequest) {
    actionButtons.push(
      <Button key="online" type="primary" icon={<GlobalOutlined />} loading={actionLoading}
        onClick={() => runAction('进入线上办理', () => startInServiceProcessing(order.id, 'online'))}>
        线上办理
      </Button>,
      <Button key="offline" icon={<HomeOutlined />} loading={actionLoading}
        onClick={() => runAction('进入线下办理', () => startInServiceProcessing(order.id, 'offline'))}>
        线下办理
      </Button>,
    );
  }
  if (order.status === 'processing' && canHandle && !materialChangeRequest) {
    actionButtons.push(
      <Button key="supplement" icon={<ReloadOutlined />} loading={actionLoading}
        onClick={() => askReason('要求补充材料', '发起补料', (reason) => requestInServiceOrderInfo(order.id, reason))}>
        需补充材料
      </Button>,
      <Button key="success" type="primary" icon={<CheckCircleOutlined />} loading={actionLoading}
        onClick={() => askOutcome(true)}>
        办理成功
      </Button>,
      <Button key="failed" danger icon={<CloseCircleOutlined />} loading={actionLoading}
        onClick={() => askOutcome(false)}>
        办理失败
      </Button>,
    );
  }
  if (canCancel) {
    actionButtons.push(
      <Button key="cancel" danger icon={<StopOutlined />} loading={actionLoading}
        onClick={() => askReason('取消订单', '取消订单', (reason) => cancelInServiceOrder(order.id, reason))}>
        取消订单
      </Button>,
    );
  }

  return (
    <PageContainer header={{ title: orderMeta.label + '详情', extra: actionButtons }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {materialChangeRequest ? (
          <Alert
            showIcon
            type="warning"
            message="材料修改申请待审批"
            description={[
              `申请时间：${formatDate(materialChangeRequest.requestedAt)}`,
              materialChangeRequest.reason ? `申请说明：${materialChangeRequest.reason}` : null,
            ].filter(Boolean).join('；')}
          />
        ) : null}
        <Card size="small">
          <Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 3 }}>
            <Descriptions.Item label="工单编号">
              <Typography.Text copyable>{order.orderNo}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color={statusMeta.color}>{statusMeta.label}</Tag></Descriptions.Item>
            <Descriptions.Item label="期望完成日期">{order.expectedCompletionDate || '-'}</Descriptions.Item>
            <Descriptions.Item label="客户">{order.customerName || order.customerCode || order.customerId}</Descriptions.Item>
            {order.employeeName ? <Descriptions.Item label="姓名">{order.employeeName}</Descriptions.Item> : null}
            {order.idCardNo ? <Descriptions.Item label="证件号">{order.idCardNo}</Descriptions.Item> : null}
            <Descriptions.Item label="发起部门">{order.departmentName || order.departmentId}</Descriptions.Item>
            <Descriptions.Item label="发起人">{order.createdByName || order.createdBy}</Descriptions.Item>
            <Descriptions.Item label="办理事由">{order.businessReason}</Descriptions.Item>
            <Descriptions.Item label="客户支付服务费">
              {order.serviceFee == null ? '-' : `¥${order.serviceFee.toFixed(2)}`}
            </Descriptions.Item>
            <Descriptions.Item label="缴纳地">
              {[order.province, order.city, order.district].filter(Boolean).join(' / ')}
            </Descriptions.Item>
            <Descriptions.Item label="业务分类">
              {getInServiceCategoryPath(order.businessType, order.processType, order.requirementType)}
            </Descriptions.Item>
            <Descriptions.Item label="配置负责人">{order.handlerName || order.handlerId || '待配置'}</Descriptions.Item>
            <Descriptions.Item label="办理渠道">
              {order.processingAt ? <Tag color={channelMeta.color}>{channelMeta.label}</Tag> : '尚未选择'}
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">{formatDate(order.createdAt)}</Descriptions.Item>
            {order.pendingInfoReason ? (
              <Descriptions.Item label="补料清单">{order.pendingInfoReason}</Descriptions.Item>
            ) : null}
            {order.completionRemark ? (
              <Descriptions.Item label="办理结果">{order.completionRemark}</Descriptions.Item>
            ) : null}
            {order.closeReason ? (
              <Descriptions.Item label="取消原因">{order.closeReason}</Descriptions.Item>
            ) : null}
          </Descriptions>
        </Card>

        <Card size="small" title="工单进度">
          <Steps
            current={currentStep(order)}
            status={order.status === 'completed' ? 'finish' : ['failed', 'cancelled'].includes(order.status) ? 'error' : 'process'}
            items={[
              { title: '创建' },
              { title: '待受理' },
              { title: '材料初审' },
              { title: '办理中' },
              { title: '办理结果' },
            ]}
          />
        </Card>

        <Card size="small" title="业务信息">
          <InServiceOrderForm form={form} orderKind={order.orderKind} initialValues={order} readOnly={!canEdit} />
        </Card>

        <Card size="small" title="流转记录">
          <Timeline items={buildTimelineItems(order)} />
        </Card>
      </Space>
    </PageContainer>
  );
}
