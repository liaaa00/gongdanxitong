import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import {
  Card, Tag, Space, Button, Descriptions, App, Alert,
  Empty,
} from 'antd';
import type { FieldConfig } from '@/components/DynamicForm';
import { getWorkOrder } from '@/services/workOrders';
import type { WorkOrderItem } from '@/services/workOrders';
import { getCreateWorkOrderFields } from '@/services/importTemplates';
import { getFields } from '@/services/fields';
import { getStatusColor, getStatusText } from '@/constants/dictionaries';
import { getModuleLabel } from '@/constants/modules';
import MaterialsUpload from '@/components/MaterialsUpload';

// 主工单详情仅展示数据和子工单进度；字段范围严格跟随后台导入模板配置。
function mergeImportFieldsWithSystemMeta(importFields: FieldConfig[], systemFields: FieldConfig[]): FieldConfig[] {
  const systemMap = new Map(systemFields.map((field) => [field.field_code, field]));
  return importFields.map((field, index) => {
    const systemField = systemMap.get(field.field_code);
    return {
      ...(systemField || {}),
      ...field,
      field_name: field.field_name || systemField?.field_name || field.field_code,
      field_type: field.field_type || systemField?.field_type || 'text',
      is_required: field.is_required ?? systemField?.is_required ?? false,
      default_required: field.default_required ?? systemField?.default_required ?? false,
      dropdown_options: field.dropdown_options ?? systemField?.dropdown_options ?? null,
      collection_group: field.collection_group || systemField?.collection_group || null,
      display_order: field.display_order ?? index + 1,
    };
  });
}

const WorkOrdersDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { message } = App.useApp();
  const [order, setOrder] = useState<WorkOrderItem | null>(null);
  const [fields, setFields] = useState<FieldConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);

    const loadDetail = async () => {
      try {
        const orderData = await getWorkOrder(id);
        const orderType = orderData.order_type || 'onboarding';
        const [importFields, systemFields] = await Promise.all([
          getCreateWorkOrderFields(orderType).catch((err) => {
            console.warn('[工单详情] 导入模板字段配置加载失败，降级为空字段列表：', err);
            return [] as FieldConfig[];
          }),
          getFields(orderType).catch((err) => {
            console.warn('[工单详情] 系统字段配置加载失败，降级为空字段列表：', err);
            return [] as FieldConfig[];
          }),
        ]);
        if (cancelled) return;
        setOrder(orderData);
        setFields(mergeImportFieldsWithSystemMeta(importFields as FieldConfig[], systemFields as FieldConfig[]));
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
  }, [fields, order]);
  const missingFieldSet = useMemo(() => new Set(completionHintFields), [completionHintFields]);
  const highlightedFields = useMemo(() => {
    const fromList = (searchParams.get('highlightFields') || '').split(',').map((item) => item.trim()).filter(Boolean);
    const focus = searchParams.get('focus');
    return Array.from(new Set([...(focus ? [focus] : []), ...fromList]));
  }, [searchParams]);
  const highlightedFieldSet = useMemo(() => new Set(highlightedFields), [highlightedFields]);

  const getSubOrderReturnReason = (subOrder: unknown): string | null => {
    const row = subOrder as { return_reason?: unknown; returnReason?: unknown };
    return (row.return_reason ?? row.returnReason ?? null) as string | null;
  };

  if (loading) return <PageContainer loading />;
  if (!order) return <PageContainer header={{ title: '工单详情' }}><Empty description="工单不存在" /></PageContainer>;

  return (
    <PageContainer header={{ title: '工单详情', extra: [<Button key="back" onClick={() => navigate(listPath)}>返回{currentOrderTypeLabel || ''}主工单列表</Button>] }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* 基本信息 */}
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
          {Array.from(fields.reduce((map, field) => {
            const groupName = field.collection_group?.trim() || '未分组字段';
            const groupFields = map.get(groupName) || [];
            groupFields.push(field);
            map.set(groupName, groupFields);
            return map;
          }, new Map<string, FieldConfig[]>()).entries()).map(([groupTitle, groupFields]) => {
            if (groupFields.length === 0) return null;
            return (
              <Card key={groupTitle} title={groupTitle} size="small">
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
        </Space>

        {/* 离职材料附件（附件挂在主工单 id 上，bizPurpose=resignation_material） */}
        {isResignationOrder && id && (
          <MaterialsUpload workOrderId={id} bizPurpose="resignation_material" />
        )}
      </Space>
    </PageContainer>
  );
};

export default WorkOrdersDetail;
