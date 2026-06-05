import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import {
  Card, Tag, Space, Button, Descriptions, App, Alert,
  Empty, Modal, Input,
} from 'antd';
import DynamicForm from '@/components/DynamicForm';
import MaterialsUpload from '@/components/MaterialsUpload';
import type { FieldConfig } from '@/components/DynamicForm';
import { useFieldPermissions } from '@/hooks/useFieldPermissions';
import { getWorkOrder, updateWorkOrder, resubmitWorkOrder, voidWorkOrder } from '@/services/workOrders';
import type { WorkOrderItem } from '@/services/workOrders';
import { getFields } from '@/services/fields';
import { getStatusColor, getStatusText } from '@/constants/dictionaries';
import { getModuleLabel } from '@/constants/modules';

// 子工单名称统一由 constants/modules.ts 处理。

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
    codes: ['social_location', 'start_month', 'social_base', 'fund_base', 'fund_ratio'],
  },
  {
    title: '银行与备注',
    codes: ['bank_name', 'bank_account', 'remark', 'special_remark'],
  },
  {
    title: '离职信息',
    codes: ['resignation_type', 'resignation_reason', 'last_work_date', 'contract_terminate_date', 'handover_person', 'need_resignation_cert', 'cert_delivery_address'],
  },
  {
    title: '后道反馈',
    codes: ['need_onboarding_contact', 'onboarding_feedback', 'data_entry_feedback', 'resignation_contact_feedback', 'resignation_cert_status', 'social_handover_done', 'final_salary_settled', 'resignation_remark'],
  },
];

// 主工单详情仅展示数据和子工单进度；修改、撤回、作废、催办统一在子工单页面处理。

const WorkOrdersDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { message } = App.useApp();
  const { permissions } = useFieldPermissions('main');
  const [order, setOrder] = useState<WorkOrderItem | null>(null);
  const [fields, setFields] = useState<FieldConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);

    const loadDetail = async () => {
      try {
        const orderData = await getWorkOrder(id);
        const orderType = orderData.order_type || 'onboarding';
        const fieldList = await getFields(orderType).catch((err) => {
          console.warn('[工单详情] 字段配置加载失败，降级为空字段列表：', err);
          return [] as FieldConfig[];
        });
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
  }, [id, message, searchParams]);

  const currentOrderType = order?.order_type || 'onboarding';
  const isResignationOrder = currentOrderType === 'resignation' || currentOrderType === 'offboarding' || currentOrderType === 'leave';
  const currentOrderTypeLabel = isResignationOrder ? '离职' : currentOrderType === 'onboarding' ? '入职' : '';
  const listPath = currentOrderTypeLabel ? `/work-orders?orderType=${currentOrderType === 'onboarding' ? 'onboarding' : 'resignation'}` : '/work-orders';
  const isRepairable = order?.status === 'returned' || order?.status === 'withdrawn';
  const isReturned = order?.status === 'returned';

  const handleResubmit = async (values: Record<string, unknown>) => {
    if (!id || !order || !isRepairable) return;
    setSubmitting(true);
    try {
      await updateWorkOrder(id, values);
      const updated = await resubmitWorkOrder(id, values);
      setOrder(updated);
      message.success('已修改并重新提交');
    } catch (err) {
      console.error('[工单详情] 修改重新提交失败：', err);
      message.error('修改重新提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoidRequest = async () => {
    if (!id || !order || !isRepairable) return;
    const reason = voidReason.trim();
    if (!reason) {
      message.warning('请填写作废原因');
      return;
    }
    setSubmitting(true);
    try {
      const updated = await voidWorkOrder(id, reason);
      setOrder(updated);
      setVoidOpen(false);
      setVoidReason('');
      message.success('作废申请已提交，待后道审批');
    } catch (err) {
      console.error('[工单详情] 作废申请失败：', err);
      message.error('作废申请失败');
    } finally {
      setSubmitting(false);
    }
  };

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
  const highlightedFields = useMemo(() => {
    const fromList = (searchParams.get('highlightFields') || '').split(',').map((item) => item.trim()).filter(Boolean);
    const focus = searchParams.get('focus');
    return Array.from(new Set([...(focus ? [focus] : []), ...fromList]));
  }, [searchParams]);
  const highlightedFieldSet = useMemo(() => new Set(highlightedFields), [highlightedFields]);
  const focusField = searchParams.get('focus') || highlightedFields[0] || null;

  useEffect(() => {
    if (searchParams.get('focus') !== 'materials') return;
    window.setTimeout(() => document.getElementById('materials')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }, [searchParams]);

  const getSubOrderReturnReason = (subOrder: unknown): string | null => {
    const row = subOrder as { return_reason?: unknown; returnReason?: unknown };
    return (row.return_reason ?? row.returnReason ?? null) as string | null;
  };

  if (loading) return <PageContainer loading />;
  if (!order) return <PageContainer header={{ title: '工单详情' }}><Empty description="工单不存在" /></PageContainer>;

  return (
    <PageContainer header={{ title: '工单详情', extra: [<Button key="back" onClick={() => navigate(listPath)}>返回{currentOrderTypeLabel || ''}主工单列表</Button>] }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* 基本信息 + 操作按钮 */}
        <Card>
          <Descriptions column={3} bordered size="small">
            <Descriptions.Item label="工单编号"><Tag color="blue">{order.order_no}</Tag></Descriptions.Item>
            <Descriptions.Item label="订单类型"><Tag>{order.order_type === 'onboarding' ? '入职' : order.order_type === 'resignation' || order.order_type === 'offboarding' || order.order_type === 'leave' ? '离职' : order.order_type}</Tag></Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={getStatusColor(order.status)}>
                {getStatusText(order.status)}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="员工">{order.employee_name}</Descriptions.Item>
            <Descriptions.Item label="客户">{order.customer_name}</Descriptions.Item>
            <Descriptions.Item label="创建人">{order.created_by}</Descriptions.Item>
            <Descriptions.Item label="提交时间">{order.submitted_at || '-'}</Descriptions.Item>
            <Descriptions.Item label="完成时间">{order.completed_at || '-'}</Descriptions.Item>
            <Descriptions.Item label="更新时间">{order.updated_at}</Descriptions.Item>
          </Descriptions>


          {isRepairable && (
            <Space style={{ marginTop: 12 }} wrap>
              <Button type="primary" loading={submitting} onClick={() => document.getElementById('repairable-main-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>修改重新提交</Button>
              <Button danger loading={submitting} onClick={() => setVoidOpen(true)}>一键作废</Button>
            </Space>
          )}
          {completionHintFields.length > 0 && (
            <Alert
              style={{ marginTop: 12 }}
              type="warning"
              showIcon
              message={`本工单有 ${completionHintFields.length} 个字段未补全，请到对应子工单补充或修改`}
            />
          )}
                    {isReturned && (
            <Alert style={{ marginTop: 12 }} message="工单存在被退回的子工单，请到对应子工单处理"
              description={
                <Space direction="vertical" size={2}>
                  <span>被退回的子工单：</span>
                  {order.dispatched_orders?.filter((d) => d.status === 'returned').map((d) => {
                    const reason = getSubOrderReturnReason(d);
                    return <Tag key={d.id} color="warning">{getModuleLabel(d.module_code, order.order_type)}{reason ? ': ' + reason : ''}</Tag>;
                  })}
                </Space>
              } type="warning" showIcon />
          )}
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
                    const highlighted = highlightedFieldSet.has(f.field_code);
                    return (
                      <Descriptions.Item
                        key={f.field_code}
                        label={f.field_name}
                        labelStyle={missingFieldSet.has(f.field_code) || highlighted ? { color: highlighted ? '#d46b08' : '#d48806', fontWeight: 600 } : undefined}
                        contentStyle={highlighted ? { background: '#fffbe6' } : undefined}
                      >
                        {highlighted ? <Tag color="gold">{value}</Tag> : missingFieldSet.has(f.field_code) ? <Tag color="warning">{value}</Tag> : value}
                      </Descriptions.Item>
                    );
                  })}
                </Descriptions>
              </Card>
            );
          })}
          <Card id="repairable-main-form" title={isRepairable ? '工单数据（可返修）' : '工单数据（只读）'} size="small">
            <DynamicForm
              fields={fields}
              fieldPermissions={permissions}
              orderType={currentOrderType}
              initialValues={order.extra_data}
              readOnly={!isRepairable}
              onFinish={isRepairable ? handleResubmit : undefined}
              submitText="修改重新提交"
              highlightedFields={highlightedFields}
              focusField={focusField}
            />

          </Card>
        </Space>

        {isResignationOrder && order?.id && (
          <div id="materials">
            <MaterialsUpload workOrderId={order.id} bizPurpose="resignation_material" />
          </div>
        )}

        <Modal
          title="一键作废申请"
          open={voidOpen}
          confirmLoading={submitting}
          okButtonProps={{ danger: true }}
          onOk={handleVoidRequest}
          onCancel={() => { setVoidOpen(false); setVoidReason(''); }}
        >
          <Space direction="vertical" style={{ width: '100%' }}>

            <span>作废原因（必填）：</span>
            <Input.TextArea rows={4} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} maxLength={512} showCount placeholder="请填写作废原因" />
          </Space>
        </Modal>
      </Space>
    </PageContainer>
  );
};

export default WorkOrdersDetail;


