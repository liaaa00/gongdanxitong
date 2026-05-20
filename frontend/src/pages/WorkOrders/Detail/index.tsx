import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import {
  Card, Tag, Space, Button, Descriptions, App, Popconfirm, Alert,
  Row, Col, Empty,
} from 'antd';
import {
  CheckCircleOutlined, EditOutlined, EyeOutlined,
} from '@ant-design/icons';
import DynamicForm from '@/components/DynamicForm';
import type { FieldConfig } from '@/components/DynamicForm';
import { useFieldPermissions } from '@/hooks/useFieldPermissions';
import { getWorkOrder, resubmitWorkOrder, updateWorkOrder } from '@/services/workOrders';
import type { WorkOrderItem } from '@/services/workOrders';
import { getFields } from '@/services/fields';

const STATUS_TEXT_MAP: Record<string, string> = {
  draft: '草稿',
  pending: '待派发',
  processing: '处理中',
  completed: '已完成',
  returned: '已退回',
  withdrawn: '已撤回',
};

const FLOW_LABELS: Record<string, string> = {
  data_entry: '数据录入',
  contract: '劳动合同签约',
  onboarding_contact: '入职联系',
  social_insurance: '社保公积金办理',
  renewal_contract: '续签合同',
  resignation_contact: '离职联系',
  resignation_cert: '离职证明',
  benefit_apply: '待遇申报',
};

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
    codes: ['salary_form', 'base_salary', 'other_salary', 'probation_salary', 'payroll_cycle', 'payroll_date', 'need_company_payroll', 'payroll_location'],
  },
  {
    title: '社保公积金（参考）',
    codes: ['social_location', 'start_month', 'social_base', 'fund_base', 'fund_ratio', 'social_urge'],
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

const WorkOrdersDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { permissions } = useFieldPermissions('main');
  const [order, setOrder] = useState<WorkOrderItem | null>(null);
  const [fields, setFields] = useState<FieldConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);

    const loadDetail = async () => {
      try {
        const [orderData, fieldList] = await Promise.all([
          getWorkOrder(id),
          getFields('onboarding').catch((err) => {
            console.warn('[工单详情] 字段配置加载失败，降级为空字段列表：', err);
            return [] as FieldConfig[];
          }),
        ]);
        if (cancelled) return;
        setOrder(orderData);
        setFields(fieldList);
      } catch (err) {
        console.error('[工单详情] 主详情加载失败：', err);
        if (!cancelled) {
          setOrder(null);
          message.error('加载工单详情失败');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadDetail();
    return () => { cancelled = true; };
  }, [id, message]);

  const handleResubmit = async () => {
    if (!id || !order) return;
    try {
      const updated = await resubmitWorkOrder(id, order.extra_data);
      setOrder(updated);
      setEditMode(false);
      message.success('已重新提交');
    } catch {
      message.error('重新提交失败');
    }
  };

  const handleSaveEdit = async (values: Record<string, unknown>) => {
    if (!id) return;
    setSavingEdit(true);
    try {
      const updated = await updateWorkOrder(id, { extra_data: { ...(order?.extra_data || {}), ...values } });
      setOrder(updated);
      setEditMode(false);
      message.success('已保存');
    } catch {
      message.error('保存失败');
    } finally {
      setSavingEdit(false);
    }
  };

  const isTerminal = order?.status === 'completed' || order?.status === 'withdrawn';
  const isCompleted = order?.status === 'completed';
  const isReturned = order?.status === 'returned';

  const completionHintFields = useMemo(() => {
    if (!order) return [];
    const extraData = (order.extra_data || {}) as Record<string, unknown>;
    const normalizedString = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim());
    const missing: string[] = [];
    for (const field of fields) {
      const value = extraData[field.field_code];
      const raw = normalizedString(value);
      const isPlaceholder = raw === '待补充';
      const isEmpty = raw === '' || raw === '-';
      const isRequired = field.is_required || field.default_required;
      const maybeConditional = !isRequired && field.help_text && /必填|当.*时/.test(field.help_text);
      if ((isRequired || maybeConditional) && (isEmpty || isPlaceholder)) missing.push(field.field_code);
    }
    return missing;
  }, [fields, order?.extra_data]);
  const missingFieldSet = useMemo(() => new Set(completionHintFields), [completionHintFields]);

  const getSubOrderReturnReason = (subOrder: unknown): string | null => {
    const row = subOrder as { return_reason?: unknown; returnReason?: unknown };
    return (row.return_reason ?? row.returnReason ?? null) as string | null;
  };

  if (loading) return <PageContainer loading />;
  if (!order) return <PageContainer header={{ title: '工单详情' }}><Empty description="工单不存在" /></PageContainer>;

  return (
    <PageContainer header={{ title: '工单详情', extra: [<Button key="back" onClick={() => navigate('/work-orders')}>返回列表</Button>] }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* 基本信息 + 操作按钮 */}
        <Card>
          <Descriptions column={3} bordered size="small">
            <Descriptions.Item label="工单编号"><Tag color="blue">{order.order_no}</Tag></Descriptions.Item>
            <Descriptions.Item label="订单类型"><Tag>{order.order_type === 'onboarding' ? '入职' : order.order_type}</Tag></Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={order.status === 'completed' ? 'success' : order.status === 'returned' ? 'warning' : order.status === 'withdrawn' ? 'default' : order.status === 'processing' ? 'processing' : 'blue'}>
                {STATUS_TEXT_MAP[order.status] || order.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="员工">{order.employee_name}</Descriptions.Item>
            <Descriptions.Item label="客户">{order.customer_name}</Descriptions.Item>
            <Descriptions.Item label="创建人">{order.created_by}</Descriptions.Item>
            <Descriptions.Item label="提交时间">{order.submitted_at || '-'}</Descriptions.Item>
            <Descriptions.Item label="完成时间">{order.completed_at || '-'}</Descriptions.Item>
            <Descriptions.Item label="更新时间">{order.updated_at}</Descriptions.Item>
          </Descriptions>

          {!isTerminal && (
            <Space style={{ marginTop: 16 }} wrap>
              {!editMode && (
                <Button type="primary" icon={<EditOutlined />} onClick={() => setEditMode(true)}>
                  编辑工单
                </Button>
              )}
              {editMode && (
                <Button onClick={() => setEditMode(false)}>取消编辑</Button>
              )}
              {isReturned && (
                <Popconfirm title="确定重新提交？退回的子工单将重置并重新派发。" onConfirm={handleResubmit}>
                  <Button type="primary" icon={<CheckCircleOutlined />}>重新提交</Button>
                </Popconfirm>
              )}
            </Space>
          )}
          {completionHintFields.length > 0 && (
            <Alert
              style={{ marginTop: 12 }}
              type="warning"
              showIcon
              message={`本工单有 ${completionHintFields.length} 个字段未补全，请点击"修改工单"补充`}
            />
          )}
          {isCompleted && (
            <Alert style={{ marginTop: 12 }} type="info" showIcon
              message="已办结工单修改说明"
              description="修改后将自动同步到子工单并通知下游办理人。可修改业务员填写的基础字段（姓名、证件号、联系方式等），其他字段为只读。" />
          )}
          {isReturned && (
            <Alert style={{ marginTop: 12 }} message="工单已被退回，请修改后重新提交"
              description={
                <Space direction="vertical" size={2}>
                  <span>被退回的子工单：</span>
                  {order.dispatched_orders?.filter((d) => d.status === 'returned').map((d) => {
                    const reason = getSubOrderReturnReason(d);
                    return <Tag key={d.id} color="warning">{FLOW_LABELS[d.module_code] || '未知子工单'}{reason ? ': ' + reason : ''}</Tag>;
                  })}
                </Space>
              } type="warning" showIcon />
          )}
        </Card>

        {/* 子工单状态 */}
        <Card title="子工单状态">
          {order.dispatched_orders && order.dispatched_orders.length > 0 ? (
            <Row gutter={[16, 16]}>
              {order.dispatched_orders.map((d) => (
                <Col xs={24} sm={12} lg={8} xl={6} key={d.id}>
                  <Card size="small" title={FLOW_LABELS[d.module_code] || '未知子工单'}
                    extra={<Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate('/my-dispatched/' + d.id)}>查看</Button>}
                    style={{ borderLeft: '3px solid ' + (d.status === 'completed' ? '#52c41a' : d.status === 'returned' ? '#faad14' : d.status === 'processing' ? '#1677ff' : '#d9d9d9') }}>
                    <Descriptions column={1} size="small" colon={false}>
                      <Descriptions.Item label="状态">
                        <Tag color={d.status === 'completed' ? 'success' : d.status === 'returned' ? 'warning' : d.status === 'processing' ? 'processing' : 'default'}>
                          {d.status === 'pending' ? '待处理' : d.status === 'processing' ? '处理中' : d.status === 'completed' ? '已完成' : '已退回'}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="处理人">{d.handler_name || <Tag>公共池</Tag>}</Descriptions.Item>
                      {getSubOrderReturnReason(d) && <Descriptions.Item label="原因"><span style={{ color: '#faad14' }}>{getSubOrderReturnReason(d)}</span></Descriptions.Item>}
                    </Descriptions>
                  </Card>
                </Col>
              ))}
            </Row>
          ) : <Empty description="暂无子工单" />}
        </Card>

        {/* 工单字段信息 */}
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {FIELD_GROUPS.map((group) => {
            const groupFields = fields.filter((f) => group.codes.includes(f.field_code));
            if (groupFields.length === 0) return null;
            return (
              <Card key={group.title} title={group.title} size="small">
                <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small" bordered>
                  {groupFields.map((f) => {
                    const raw = (order.extra_data as Record<string, unknown> | undefined)?.[f.field_code];
                    const value = raw === null || raw === undefined || raw === '' ? '-' : String(raw);
                    return (
                      <Descriptions.Item
                        key={f.field_code}
                        label={f.field_name}
                        labelStyle={missingFieldSet.has(f.field_code) ? { color: '#d48806', fontWeight: 600 } : undefined}
                      >
                        {missingFieldSet.has(f.field_code) ? <Tag color="warning">{value}</Tag> : value}
                      </Descriptions.Item>
                    );
                  })}
                </Descriptions>
              </Card>
            );
          })}
          <Card title={editMode ? (isCompleted ? '修改工单（仅可修改业务员填写字段）' : '编辑工单信息') : '工单数据'} size="small">
            <DynamicForm
              fields={fields}
              fieldPermissions={editMode && isCompleted
                ? Object.fromEntries(fields.map((f) => {
                    const businessFields = [
                      'customer_name', 'customer_code', 'branch_code',
                      'employee_name', 'id_card_no', 'gender', 'birth_date', 'age',
                      'household_type', 'ethnicity', 'mobile', 'email',
                      'current_address', 'household_address', 'postal_code',
                      'business_mode', 'employee_type', 'position', 'outsource_type',
                      'bank_name', 'bank_account', 'remark', 'contract_template',
                    ];
                    return [f.field_code, businessFields.includes(f.field_code) ? 'visible' as const : 'readonly' as const];
                  }))
                : permissions
              }
              orderType="onboarding"
              initialValues={order.extra_data}
              readOnly={!editMode && !isReturned}
              onFinish={editMode ? handleSaveEdit : undefined}
              submitText={editMode ? (isCompleted ? '保存修改（将通知下游）' : '保存修改') : undefined}
              loading={savingEdit}
            />
          </Card>
        </Space>
      </Space>
    </PageContainer>
  );
};

export default WorkOrdersDetail;


