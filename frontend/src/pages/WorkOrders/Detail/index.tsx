import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import {
  Card, Tag, Space, Button, Descriptions, App, Alert,
  Empty, Modal, Input,
} from 'antd';
import DynamicForm from '@/components/DynamicForm';
import type { FieldConfig } from '@/components/DynamicForm';
import { useFieldPermissions } from '@/hooks/useFieldPermissions';
import { getWorkOrder, updateWorkOrder, resubmitWorkOrder, voidWorkOrder } from '@/services/workOrders';
import type { WorkOrderItem } from '@/services/workOrders';
import { getFields } from '@/services/fields';
import { getStatusColor, getStatusText } from '@/constants/dictionaries';

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
    codes: ['social_location', 'start_month', 'social_base', 'fund_base', 'fund_ratio'],
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
        if (searchParams.get('edit') === '1' && !['returned', 'withdrawn'].includes(orderData.status)) {
          message.info('主工单仅支持查看，请到对应子工单中进行修改、撤回、作废或催办。');
        }
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

          <Alert
            style={{ marginTop: 16 }}
            type={isRepairable ? 'warning' : 'info'}
            showIcon
            message={isRepairable ? '当前工单为可返修状态' : '主工单仅用于查看汇总信息'}
            description={isRepairable ? '已撤回/已退回工单允许修改后重新提交，或发起一键作废申请；作废仍需后道审批同意后才会终结。' : '修改、撤回、作废、催办等操作请进入下方对应子工单处理，避免影响其他正常子工单。'}
          />
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
                    return <Tag key={d.id} color="warning">{FLOW_LABELS[d.module_code] || '未知子工单'}{reason ? ': ' + reason : ''}</Tag>;
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
              orderType="onboarding"
              initialValues={order.extra_data}
              readOnly={!isRepairable}
              onFinish={isRepairable ? handleResubmit : undefined}
              submitText="修改重新提交"
              highlightedFields={highlightedFields}
              focusField={focusField}
            />
            {isRepairable && <Alert style={{ marginTop: 12 }} type="info" showIcon message="修改完成后点击表单底部“修改重新提交”按钮，流程会重新激活。" />}
          </Card>
        </Space>
        <Modal
          title="一键作废申请"
          open={voidOpen}
          confirmLoading={submitting}
          okButtonProps={{ danger: true }}
          onOk={handleVoidRequest}
          onCancel={() => { setVoidOpen(false); setVoidReason(''); }}
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert type="warning" showIcon message="非草稿工单作废必须提交后道审批，同意后才会流转至已作废。" />
            <span>作废原因（必填）：</span>
            <Input.TextArea rows={4} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} maxLength={512} showCount placeholder="请填写作废原因" />
          </Space>
        </Modal>
      </Space>
    </PageContainer>
  );
};

export default WorkOrdersDetail;


