import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import {
  Card, Descriptions, Tag, Button, Space, App, Modal, Input, Select,
  Empty, Alert, Form, Checkbox, Timeline, Badge, List, Tooltip,
} from 'antd';
import {
  CheckCircleOutlined, RollbackOutlined, PlusCircleOutlined,
  ExportOutlined, UserSwitchOutlined, HistoryOutlined,
  WarningOutlined, EyeOutlined,
} from '@ant-design/icons';
import DynamicForm from '@/components/DynamicForm';
import type { FieldConfig } from '@/components/DynamicForm';
import { useFieldPermissions } from '@/hooks/useFieldPermissions';
import { useDispatchedActions } from '@/hooks/useDispatchedActions';
import {
  getDispatchedOrder,
  confirmDispatchedDirtyRead,
  returnCompletedDispatchedOrder,
} from '@/services/dispatchedOrders';
import type { DirtyFieldMark, DispatchedOrderItem } from '@/services/dispatchedOrders';
import { getFields } from '@/services/fields';
import { getExportTemplates } from '@/services/exportTemplates';
import type { ExportTemplateItem } from '@/services/exportTemplates';
import { getSupplementLogs } from '@/services/supplementLogs';
import type { SupplementLogItem } from '@/services/supplementLogs';
import { getModuleColor, getModuleLabel } from '@/constants/modules';
import { getStatusColor, getStatusText } from '@/constants/dictionaries';
import { useAuth } from '@/hooks/useAuth';
import { getUsersByTeam } from '@/services/users';
import type { UserItem } from '@/services/users';

const FIELD_GROUPS: Array<{ title: string; codes: string[] }> = [
  {
    title: '基础信息',
    codes: ['customer_name', 'customer_code', 'outsource_type', 'position', 'employee_name', 'id_card_no', 'gender', 'birth_date', 'age', 'household_type', 'ethnicity', 'mobile', 'email', 'current_address', 'household_address', 'postal_code', 'business_mode', 'employee_type'],
  },
  {
    title: '合同信息',
    codes: ['contract_term_type', 'contract_term', 'contract_start_date', 'contract_end_date', 'probation_start_date', 'probation_months', 'probation_end_date', 'work_city', 'work_hour_system', 'work_cycle', 'need_company_contract', 'contract_subject', 'contract_template', 'need_contract_urge', 'contract_feedback'],
  },
  {
    title: '薪资与发薪',
    codes: ['salary_form', 'base_salary', 'other_salary', 'probation_salary', 'payroll_cycle', 'payroll_date', 'need_company_payroll', 'payroll_location', 'pay_location'],
  },
  {
    title: '社保公积金',
    codes: ['social_location', 'start_month', 'social_base', 'fund_base', 'fund_ratio', 'social_urge', 'social_insurance_feedback'],
  },
  {
    title: '银行与备注',
    codes: ['bank_name', 'bank_account', 'remark', 'special_remark'],
  },
  {
    title: '后道反馈',
    codes: ['need_onboarding_contact', 'onboarding_feedback', 'data_entry_feedback'],
  },
];

const FEEDBACK_FIELD_MAP: Record<string, string> = {
  contract: 'contract_feedback', onboarding_contact: 'onboarding_feedback',
  data_entry: 'data_entry_feedback', social_insurance: 'social_insurance_feedback',
  renewal_contract: 'renewal_feedback', resignation_contact: 'resignation_contact_feedback',
  resignation_cert: 'resignation_cert_status', benefit_apply: 'benefit_result',
};

const hasText = (value: unknown) => String(value || '').trim().length > 0;

const getTeamCode = (order?: DispatchedOrderItem | null) => order?.team_code || order?.module_code || 'shared_team';

const withRequiredLabel = (field: FieldConfig): FieldConfig => ({
  ...field,
  field_name: `${field.field_name}（${field.is_required ? '必填' : '选填'}）`,
});

const filterByVisibleFields = (allFields: FieldConfig[], visibleFields?: string[]) => {
  const visibleSet = new Set((visibleFields || []).filter(Boolean));
  if (visibleSet.size === 0) return allFields;
  return allFields.filter((field) => visibleSet.has(field.field_code));
};

const MyDispatchedDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { hasRole } = useAuth();
  const scenario = 'dispatched:' + (id || '');
  const { permissions } = useFieldPermissions(scenario);

  const [order, setOrder] = useState<DispatchedOrderItem | null>(null);
  const [fields, setFields] = useState<FieldConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [supplementLogs, setSupplementLogs] = useState<SupplementLogItem[]>([]);
  const [dirtyCleared, setDirtyCleared] = useState(false);
  const [confirmReadLoading, setConfirmReadLoading] = useState(false);

  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnForm] = Form.useForm();

  const [returnCompletedOpen, setReturnCompletedOpen] = useState(false);
  const [returnCompletedForm] = Form.useForm();
  const [returnCompletedLoading, setReturnCompletedLoading] = useState(false);

  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [completeForm] = Form.useForm();

  const [supplementModalOpen, setSupplementModalOpen] = useState(false);
  const [supplementForm] = Form.useForm();

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [templates, setTemplates] = useState<ExportTemplateItem[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');

  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [reassignForm] = Form.useForm<{ handlerId: string; reason: string }>();
  const [teamUsers, setTeamUsers] = useState<UserItem[]>([]);
  const [teamUsersLoading, setTeamUsersLoading] = useState(false);

  const { actionLoading, handleAccept, handleComplete, handleReturn,
    handleSupplement, handleExport, handleReassign }
    = useDispatchedActions({ orderId: id || '', order, onOrderUpdated: setOrder });

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [orderData, fieldList, logs] = await Promise.all([getDispatchedOrder(id), getFields('onboarding'), getSupplementLogs(id)]);
      setOrder(orderData);
      setFields(fieldList);
      setSupplementLogs(logs);
      setDirtyCleared(false);
    } catch {
      message.error('加载子工单详情失败');
    } finally {
      setLoading(false);
    }
  }, [id, message]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  const dirtyFields = useMemo(() => order?.dirty_fields?.filter((mark) => mark.is_active !== false) || [], [order?.dirty_fields]);
  const dirtyFieldCodes = useMemo(() => new Set(dirtyFields.map((mark) => mark.field_code)), [dirtyFields]);
  const dirtyCount = order?.dirty_count ?? dirtyFields.length;
  const hasUnreadDirty = Boolean(order?.has_unread_dirty || dirtyFields.length > 0) && !dirtyCleared;

  const markDirtyRead = useCallback(async (reason: 'owner_open_detail' | 'confirm_read') => {
    if (!id || (!order?.has_unread_dirty && !dirtyFields.length)) return;
    setConfirmReadLoading(true);
    try {
      const result = await confirmDispatchedDirtyRead(id, reason);
      setDirtyCleared(true);
      setOrder((prev) => prev ? { ...prev, has_unread_dirty: false, dirty_count: 0, dirty_fields: [] } : prev);
      if (result.success) message.success('已标记为已阅');
      else message.info('已在当前页面标记为已阅，后端清除接口待联调');
    } catch {
      message.warning('确认已阅失败，请稍后重试');
    } finally {
      setConfirmReadLoading(false);
    }
  }, [dirtyFields.length, id, message, order?.has_unread_dirty]);

  useEffect(() => {
    if (!loading && order && (order.has_unread_dirty || dirtyFields.length > 0)) {
      markDirtyRead('owner_open_detail');
    }
  }, [dirtyFields.length, loading, markDirtyRead, order]);

  const visibleFields = useMemo(() => order?.visible_fields || [], [order?.visible_fields]);
  const visibleDetailFields = useMemo(() => filterByVisibleFields(fields, visibleFields), [fields, visibleFields]);
  const dynamicVisibleFields = useMemo(() => visibleDetailFields.map(withRequiredLabel), [visibleDetailFields]);
  const visibleFieldPermissions = useMemo(() => {
    if (!visibleFields.length) return permissions;
    const allowed = new Set(visibleFields);
    return Object.fromEntries(fields.map((field) => [
      field.field_code,
      allowed.has(field.field_code) ? (permissions[field.field_code] || 'visible') : 'hidden',
    ])) as Record<string, 'visible' | 'hidden' | 'readonly' | 'masked'>;
  }, [fields, permissions, visibleFields]);

  const supplementableFields = useMemo(() => {
    if (!order?.supplementable_fields || !fields) return [];
    const visibleSet = new Set(visibleFields);
    return fields.filter((f) => order.supplementable_fields?.includes(f.field_code) && (visibleSet.size === 0 || visibleSet.has(f.field_code)));
  }, [order, fields, visibleFields]);

  const emptySupplementFields = useMemo(() =>
    supplementableFields.filter((f) =>
      !order?.extra_data?.[f.field_code] || order.extra_data[f.field_code] === ''
    ),
    [supplementableFields, order],
  );

  const refreshLogs = () => {
    if (id) getSupplementLogs(id).then(setSupplementLogs);
  };

  if (loading) return <PageContainer loading />;
  if (!order) return <PageContainer header={{ title: '子工单详情' }}><Empty description="子工单不存在" /></PageContainer>;

  const canAccept = order.status === 'pending';
  const canComplete = order.status === 'processing';
  const canReturn = order.status === 'processing' || order.status === 'pending';
  const canSupplement = order.status === 'processing' && supplementableFields.length > 0;
  const isTerminal = order.status === 'completed' || order.status === 'returned';
  const canReturnCompleted = order.status === 'completed' && (
    order.action_permissions?.return_completed === true ||
    order.is_module_supervisor === true ||
    hasRole('admin')
  );

  const handleReturnOk = async () => {
    const values = await returnForm.validateFields();
    await handleReturn(values.reason, values.fields);
    setReturnModalOpen(false);
  };

  const handleReturnCompletedOk = async () => {
    const values = await returnCompletedForm.validateFields();
    const reason = String(values.reason || '').trim();
    if (!hasText(reason)) {
      message.warning('请填写退回原因');
      return;
    }
    setReturnCompletedLoading(true);
    try {
      const updated = await returnCompletedDispatchedOrder(order.id, reason);
      setOrder({ ...order, ...updated, status: updated.status || 'returned', return_reason: reason });
      message.success('已退回该已完成节点');
      setReturnCompletedOpen(false);
      returnCompletedForm.resetFields();
    } catch {
      message.error('退回已完成节点失败');
    } finally {
      setReturnCompletedLoading(false);
    }
  };

  const handleCompleteOk = async () => {
    const values = await completeForm.validateFields();
    const payload: Record<string, unknown> = { ...values };
    if (order.module_code === 'social_insurance') {
      const remark = String(values.social_insurance_remark || '').trim();
      if (!remark) {
        message.warning('请填写办理备注，不能只输入空格');
        return;
      }
      payload.social_insurance_remark = remark;
      payload.remark = remark;
    }
    await handleComplete(payload);
    setCompleteModalOpen(false);
  };

  const handleSupplementOk = async () => {
    const values = supplementForm.getFieldsValue();
    await handleSupplement(values);
    setSupplementModalOpen(false);
    refreshLogs();
  };

  const handleExportOk = async () => {
    await handleExport(selectedTemplate || undefined);
    setExportModalOpen(false);
  };

  const openReassignModal = async () => {
    if (!order) return;
    setReassignModalOpen(true);
    reassignForm.resetFields();
    setTeamUsersLoading(true);
    try {
      const users = await getUsersByTeam(getTeamCode(order));
      setTeamUsers(users.filter((u) => u.id !== order.handler_id));
    } catch {
      setTeamUsers([]);
      message.warning('同组成员加载失败，请稍后重试');
    } finally {
      setTeamUsersLoading(false);
    }
  };

  const handleReassignOk = async () => {
    const values = await reassignForm.validateFields();
    const updated = await handleReassign(values.handlerId, values.reason.trim());
    if (updated) {
      setReassignModalOpen(false);
      reassignForm.resetFields();
    }
  };

  const dirtySummary = dirtyFields.length > 0 ? dirtyFields : [];

  return (
    <PageContainer header={{
      title: '子工单详情',
      extra: [<Button key="back" onClick={() => navigate('/my-dispatched')}>返回列表</Button>],
      ghost: false,
    }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {hasUnreadDirty && (
          <Alert
            type="warning"
            showIcon
            message={`业务员更新了 ${dirtyCount || dirtyFields.length || 1} 个字段，请优先核对红色标记内容。`}
            description={
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                <span>打开详情后系统会尝试自动标记为已阅；如自动清除失败，可点击“确认已阅”重试。</span>
                {dirtySummary.length > 0 && (
                  <Space wrap>
                    {dirtySummary.map((mark) => <Tag color="red" key={mark.field_code}>{mark.field_label || fields.find((f) => f.field_code === mark.field_code)?.field_name || '已变更字段'}</Tag>)}
                  </Space>
                )}
                <Button size="small" icon={<EyeOutlined />} loading={confirmReadLoading} onClick={() => markDirtyRead('confirm_read')}>确认已阅</Button>
              </Space>
            }
          />
        )}
        {!hasUnreadDirty && dirtyCleared && <Alert type="success" showIcon message="已标记为已阅，字段变更提示已清除。" />}

        <Card>
          <Descriptions column={3} bordered size="small">
            <Descriptions.Item label="子工单号">{order.id}</Descriptions.Item>
            <Descriptions.Item label="所属工单">{order.order_no}</Descriptions.Item>
            <Descriptions.Item label="模块">
              <Tag color={getModuleColor(order.module_code)}>{getModuleLabel(order.module_code)}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={getStatusColor(order.status)}>{getStatusText(order.status)}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="员工">{order.employee_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="客户">{order.customer_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="处理人">
              {order.handler_name || <Tag color="orange">公共池</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="派发时间">{order.dispatched_at || '-'}</Descriptions.Item>
            <Descriptions.Item label="接单时间">{order.accepted_at || '-'}</Descriptions.Item>
            <Descriptions.Item label="完成时间">{order.completed_at || '-'}</Descriptions.Item>
            {order.return_reason && (
              <Descriptions.Item label="退回原因" span={3}>
                <Space direction="vertical" size={2}>
                  <span style={{ color: '#faad14' }}>{order.return_reason}</span>
                  {order.returned_fields && order.returned_fields.length > 0 && (
                    <span style={{ fontSize: 12, color: '#999' }}>
                      需补充字段：{order.returned_fields
                        .map((f) => fields.find((ff) => ff.field_code === f)?.field_name || '未知字段')
                        .join('、')}
                    </span>
                  )}
                </Space>
              </Descriptions.Item>
            )}
          </Descriptions>

          <Space style={{ marginTop: 16 }} wrap>
            {!isTerminal && canAccept && (
              <Button type="primary" icon={<CheckCircleOutlined />}
                loading={actionLoading} onClick={handleAccept}>接单</Button>
            )}
            {!isTerminal && canComplete && (
              <Button type="primary" icon={<CheckCircleOutlined />}
                onClick={() => { completeForm.resetFields(); setCompleteModalOpen(true); }}>完成</Button>
            )}
            {!isTerminal && canReturn && (
              <Button danger icon={<RollbackOutlined />}
                onClick={() => { returnForm.resetFields(); setReturnModalOpen(true); }}>退回</Button>
            )}
            {canReturnCompleted && (
              <Button danger icon={<RollbackOutlined />}
                onClick={() => { returnCompletedForm.resetFields(); setReturnCompletedOpen(true); }}>退回已完成节点</Button>
            )}
            {!isTerminal && canSupplement && (
              <Button icon={<PlusCircleOutlined />}
                onClick={() => { supplementForm.resetFields(); setSupplementModalOpen(true); }}>补充字段</Button>
            )}
            <Button icon={<ExportOutlined />} onClick={async () => {
              const tpls = await getExportTemplates(order.module_code);
              setTemplates(tpls);
              setSelectedTemplate(tpls[0]?.id || '');
              setExportModalOpen(true);
            }}>按模板导出</Button>
            {!isTerminal && (
              <Button icon={<UserSwitchOutlined />} onClick={openReassignModal}>转交</Button>
            )}
          </Space>
        </Card>

        {canSupplement && emptySupplementFields.length > 0 && (
          <Alert
            message="待补充字段（紫色标记项为空，请尽快补充）"
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            description={
              <Space wrap>
                {emptySupplementFields.map((f) => (
                  <Badge key={f.field_code} color="purple" text={f.field_name} />
                ))}
              </Space>
            }
          />
        )}

        <Card title="工单信息">
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Alert
              type={visibleFields.length > 0 ? 'info' : 'warning'}
              showIcon
              message={visibleFields.length > 0
                ? `当前节点仅展示后端 visible_fields 配置的 ${visibleFields.length} 个字段`
                : '后端未返回 visible_fields，已回退为原始字段定义'}
            />
            {FIELD_GROUPS.map((group) => {
              const groupFields = visibleDetailFields.filter((f) => group.codes.includes(f.field_code));
              if (groupFields.length === 0) return null;
              return (
                <Card key={group.title} title={group.title} size="small" type="inner">
                  <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small" bordered>
                    {groupFields.map((f) => {
                      const raw = (order.extra_data as Record<string, unknown> | undefined)?.[f.field_code];
                      const value = raw === null || raw === undefined || raw === '' ? '-' : String(raw);
                      const dirty = hasUnreadDirty && dirtyFieldCodes.has(f.field_code);
                      const dirtyInfo = dirtyFields.find((mark) => mark.field_code === f.field_code);
                      return (
                        <Descriptions.Item
                          key={f.field_code}
                          label={
                            <Space size={4}>
                              <span>{f.field_name}</span>
                              <Tag color={f.is_required ? 'red' : 'default'}>{f.is_required ? '必填' : '选填'}</Tag>
                              {dirty && <Tag color="red">已变更</Tag>}
                            </Space>
                          }
                          contentStyle={dirty ? { borderLeft: '3px solid #ff4d4f', background: '#fff1f0' } : undefined}
                        >
                          <Space direction="vertical" size={2}>
                            <span>{value}</span>
                            {dirty && dirtyInfo && (
                              <Tooltip title={`修改人：${dirtyInfo.changed_by_name || '业务员'}；修改时间：${dirtyInfo.changed_at || '未知'}`}>
                                <span style={{ color: '#cf1322', fontSize: 12 }}>
                                  原值：{dirtyInfo.old_value_text || '-'} → 新值：{dirtyInfo.new_value_text || value}
                                </span>
                              </Tooltip>
                            )}
                          </Space>
                        </Descriptions.Item>
                      );
                    })}
                  </Descriptions>
                </Card>
              );
            })}
            {canSupplement && (
              <Card title="补充字段（可编辑）" size="small" type="inner">
                <DynamicForm
                  fields={dynamicVisibleFields}
                  fieldPermissions={visibleFieldPermissions}
                  orderType="onboarding"
                  initialValues={order.extra_data || {}}
                  readOnly={false}
                />
              </Card>
            )}
          </Space>
        </Card>

        {supplementLogs.length > 0 && (
          <Card title={<><HistoryOutlined /> 补充历史</>}>
            <Timeline
              items={supplementLogs.map((log) => ({
                color: 'blue' as const,
                children: (
                  <div>
                    <div>
                      <Tag color="purple">{log.field_name}</Tag>
                      由 <strong>{log.supplemented_by}</strong> 补充
                    </div>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                      {log.old_value ? log.old_value + ' → ' : '空 → '}
                      <span style={{ color: '#1677ff' }}>{log.new_value}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#999' }}>{log.supplemented_at}</div>
                  </div>
                ),
              }))}
            />
          </Card>
        )}

        <Modal title="退回工单" open={returnModalOpen} onOk={handleReturnOk}
          onCancel={() => setReturnModalOpen(false)} confirmLoading={actionLoading}
          okButtonProps={{ danger: true }} destroyOnHidden>
          <Form form={returnForm} layout="vertical">
            <Form.Item name="reason" label="退回原因"
              rules={[
                { required: true, message: '请填写退回原因' },
                { validator: (_, value) => hasText(value) ? Promise.resolve() : Promise.reject(new Error('退回原因不能只填空格')) },
                { min: 5, message: '退回原因至少5个字符' },
                { max: 500, message: '不超过500字符' },
              ]}>
              <Input.TextArea rows={3} placeholder="请详细说明退回原因（至少5字）"
                maxLength={500} showCount />
            </Form.Item>
            {supplementableFields.length > 0 && (
              <Form.Item name="fields" label="需补充字段（选填）">
                <Checkbox.Group>
                  <Space direction="vertical">
                    {supplementableFields.map((f) => (
                      <Checkbox key={f.field_code} value={f.field_code}>
                        {f.field_name}
                      </Checkbox>
                    ))}
                  </Space>
                </Checkbox.Group>
              </Form.Item>
            )}
          </Form>
        </Modal>

        <Modal title="退回已完成节点" open={returnCompletedOpen} onOk={handleReturnCompletedOk}
          onCancel={() => setReturnCompletedOpen(false)} confirmLoading={returnCompletedLoading}
          okButtonProps={{ danger: true }} destroyOnHidden>
          <Alert style={{ marginBottom: 12 }} type="warning" showIcon
            message="退回后该节点需要重新办理"
            description="仅模块主管或系统管理员可退回已完成节点。业务员需要等待相关已完成节点被退回后才能修改并重新提交。" />
          <Form form={returnCompletedForm} layout="vertical">
            <Form.Item label="子单名称">
              <Tag color={getModuleColor(order.module_code)}>{getModuleLabel(order.module_code)}</Tag>
            </Form.Item>
            <Form.Item label="当前状态"><Tag color="success">已完成</Tag></Form.Item>
            <Form.Item name="reason" label="退回原因"
              rules={[
                { required: true, message: '请填写退回原因' },
                { validator: (_, value) => hasText(value) ? Promise.resolve() : Promise.reject(new Error('退回原因不能只填空格')) },
                { min: 5, message: '退回原因至少5个字符' },
              ]}>
              <Input.TextArea rows={4} maxLength={500} showCount placeholder="请说明为什么需要退回该已完成节点" />
            </Form.Item>
          </Form>
        </Modal>

        <Modal title="完成工单" open={completeModalOpen} onOk={handleCompleteOk}
          onCancel={() => setCompleteModalOpen(false)} confirmLoading={actionLoading} destroyOnHidden>
          <Form form={completeForm} layout="vertical">
            <Form.Item name={FEEDBACK_FIELD_MAP[order.module_code] || 'feedback'}
              label={order.module_code === 'social_insurance' ? '社保公积金办理结果' : '反馈状态'}
              rules={[{ required: true, message: '请选择反馈状态' }]}>
              <Select getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body} options={[
                { label: '已办结', value: '已办结' },
                { label: '办理中', value: '办理中' },
                { label: '未办', value: '未办' },
              ]} />
            </Form.Item>
            {order.module_code === 'social_insurance' && (
              <Form.Item
                name="social_insurance_remark"
                label="办理备注"
                rules={[
                  { required: true, message: '请填写办理备注' },
                  { validator: (_, value) => hasText(value) ? Promise.resolve() : Promise.reject(new Error('办理备注不能只填空格')) },
                ]}
              >
                <Input.TextArea rows={3} placeholder="请填写月份、社保/公积金基数、操作类型和异常说明" />
              </Form.Item>
            )}
          </Form>
        </Modal>

        <Modal title="补充字段" open={supplementModalOpen} onOk={handleSupplementOk}
          onCancel={() => setSupplementModalOpen(false)} confirmLoading={actionLoading} destroyOnHidden>
          <Form form={supplementForm} layout="vertical">
            {supplementableFields.map((field) => {
              const isEmpty = !order?.extra_data?.[field.field_code] ||
                order.extra_data[field.field_code] === '';
              return (
                <Form.Item key={field.field_code} name={field.field_code}
                  label={<Space>{field.field_name}
                    {isEmpty && <Badge color="purple" text="待补充" />}
                  </Space>}>
                  <Input placeholder={'请输入' + field.field_name}
                    status={isEmpty ? 'warning' : undefined} />
                </Form.Item>
              );
            })}
          </Form>
        </Modal>

        <Modal title="按模板导出" open={exportModalOpen} onOk={handleExportOk}
          onCancel={() => setExportModalOpen(false)} confirmLoading={actionLoading}
          width={600} destroyOnHidden>
          <Space direction="vertical" style={{ width: '100%' }}>
            <span>选择导出模板：</span>
            <Select style={{ width: '100%' }} value={selectedTemplate}
              onChange={setSelectedTemplate}
              getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
              options={templates.map((t) => ({
                label: t.template_name + '（' + (t.field_list?.length || 0) + ' 个字段）',
                value: t.id,
              }))} />
            {templates.length === 0 && <Empty description="该模块暂无导出模板" />}
            {selectedTemplate && (() => {
              const tpl = templates.find((t) => t.id === selectedTemplate);
              if (!tpl?.field_list) return null;
              return (
                <Card title="模板字段预览" size="small" style={{ marginTop: 12 }}>
                  <List size="small" bordered
                    dataSource={tpl.field_list.slice(0, 5)}
                    renderItem={(item, idx) => (
                      <List.Item>{idx + 1}. {item.alias || item.field_code}</List.Item>
                    )}
                  />
                  {tpl.field_list.length > 5 && (
                    <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
                      ...共 {tpl.field_list.length} 个字段
                    </div>
                  )}
                </Card>
              );
            })()}
          </Space>
        </Modal>

        <Modal title="转交待办" open={reassignModalOpen} onOk={handleReassignOk}
          onCancel={() => { setReassignModalOpen(false); reassignForm.resetFields(); }}
          confirmLoading={actionLoading} destroyOnHidden>
          <Form form={reassignForm} layout="vertical">
            <Form.Item label="当前节点">
              <Space wrap>
                <Tag>{order.order_no}</Tag>
                <Tag color={getModuleColor(order.module_code)}>{getModuleLabel(order.module_code)}</Tag>
                <span>{order.handler_name || '公共池'}</span>
              </Space>
            </Form.Item>
            <Form.Item name="handlerId" label="转交给" rules={[{ required: true, message: '请选择同组成员' }]}>
              <Select
                showSearch
                loading={teamUsersLoading}
                optionFilterProp="label"
                placeholder="请选择同组成员"
                getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
                options={teamUsers.map((u) => ({
                  label: `${u.real_name || u.username}（${u.group_name || u.department_name || '同组'}）`,
                  value: u.id,
                }))}
              />
            </Form.Item>
            <Form.Item
              name="reason"
              label="转交原因"
              rules={[
                { required: true, message: '请填写转交原因' },
                { validator: (_, value) => hasText(value) ? Promise.resolve() : Promise.reject(new Error('转交原因不能只填空格')) },
              ]}
            >
              <Input.TextArea rows={3} maxLength={200} showCount placeholder="例如：办理人请假，交由备用同事代办" />
            </Form.Item>
          </Form>
        </Modal>
      </Space>
    </PageContainer>
  );
};

export default MyDispatchedDetail;
