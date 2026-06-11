import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import type { ProFormInstance } from '@ant-design/pro-components';
import { Card, Button, Space, App, Divider, Result } from 'antd';
import { SendOutlined, CheckCircleOutlined } from '@ant-design/icons';
import DynamicForm from '@/components/DynamicForm';
import type { FieldConfig, ConditionalRequired } from '@/components/DynamicForm';
import { useFieldPermissions } from '@/hooks/useFieldPermissions';
import { getFallbackFields, getFields } from '@/services/fields';
import { createWorkOrder } from '@/services/workOrders';
import { getCustomers, getFallbackCustomers, type CustomerItem } from '@/services/customers';
import { useAuth } from '@/hooks/useAuth';

type SupportedOrderType = 'onboarding' | 'resignation';

const ORDER_TYPE_LABEL: Record<SupportedOrderType, string> = {
  onboarding: '入职',
  resignation: '离职',
};

const CONDITIONAL_REQUIRED_BY_TYPE: Record<SupportedOrderType, ConditionalRequired[]> = {
  onboarding: [
    { field: 'need_company_contract', value: '是', requireFields: ['need_esign', 'esign_platform', 'contract_subject', 'company_address', 'project_name', 'work_arrangement', 'contract_template', 'need_contract_urge'] },
    { field: 'need_company_payroll', value: '是', requireFields: ['payroll_location'] },
    { field: 'is_common_template', value: '是', requireFields: ['template_name'] },
  ],
  resignation: [
    { field: 'is_common_template', value: '是', requireFields: ['template_name'] },
  ],
};

function getOrderTypeFromSearch(search: string): SupportedOrderType {
  const value = new URLSearchParams(search).get('orderType');
  return value === 'resignation' ? 'resignation' : 'onboarding';
}

// 业务员发起（单条新增）阶段不展示后道办理岗反馈字段，口径与入职导入模板一致（业务规则清单 17）：
// 这三个字段由对应子工单办理岗在子单完成时填写，不属于发起表单。
export const AGENT_INITIATED_EXCLUDED_FIELD_CODES = new Set([
  'contract_feedback',
  'onboarding_feedback',
  'data_entry_feedback',
]);

export function excludeBackofficeFeedbackFields<T extends { field_code: string }>(list: T[]): T[] {
  return list.filter((f) => !AGENT_INITIATED_EXCLUDED_FIELD_CODES.has(f.field_code));
}

const WorkOrdersNew: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { message, modal } = App.useApp();
  const { hasRole } = useAuth();
  const formRef = useRef<ProFormInstance>();
  const orderType = useMemo(() => getOrderTypeFromSearch(location.search), [location.search]);
  const orderTypeLabel = ORDER_TYPE_LABEL[orderType];
  const listPath = `/work-orders?orderType=${orderType}`;
  const conditionalRequired = CONDITIONAL_REQUIRED_BY_TYPE[orderType];
  const { permissions } = useFieldPermissions(`create:${orderType}`);
  const [allFields, setAllFields] = useState<FieldConfig[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);

  const isReadonlyViewer = hasRole('business_owner') && !hasRole('admin');

  useEffect(() => {
    formRef.current?.resetFields?.();
    if (!hasRole('admin')) {
      setAllFields(excludeBackofficeFeedbackFields(getFallbackFields(orderType)));
      return;
    }
    getFields(orderType)
      .then((list) => setAllFields(excludeBackofficeFeedbackFields(list)))
      .catch(() => message.error(`加载${orderTypeLabel}字段配置失败`));
  }, [hasRole, message, orderType, orderTypeLabel]);

  useEffect(() => {
    if (!hasRole('admin')) {
      setCustomers(getFallbackCustomers({ page: 1, pageSize: 100 }).list);
      return;
    }
    getCustomers({ page: 1, pageSize: 100 })
      .then((res) => {
        if (res.success) setCustomers(res.list);
      })
      .catch(() => message.error('加载客户列表失败'));
  }, [hasRole, message]);

  const resolveCustomerIdFromValues = (values: Record<string, unknown>) => {
    const code = String(values.customer_code || '').trim();
    const name = String(values.customer_name || '').trim();
    const matched = customers.find((item) =>
      (code && item.customer_code === code) ||
      (name && item.customer_name === name),
    );
    return matched?.id;
  };

  const buildPayload = (values: Record<string, unknown>) => {
    const resolvedCustomerId = resolveCustomerIdFromValues(values);
    const resolvedCustomer = customers.find((item) => item.id === resolvedCustomerId);
    return {
      ...values,
      ...(resolvedCustomerId ? { customerId: resolvedCustomerId } : {}),
      customer_name: resolvedCustomer?.customer_name || values.customer_name,
      customer_code: resolvedCustomer?.customer_code || values.customer_code,
      orderType,
      _action: 'submit',
    };
  };

  const showSplitResult = (result: any) => {
    modal.confirm({
      title: <span>工单提交成功</span>,
      icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
      width: 480,
      closable: true,
      maskClosable: true,
      content: <span>工单 <strong>{result.order_no}</strong> 已提交。</span>,
      okText: '查看工单详情',
      cancelText: '关闭',
      onOk: () => navigate(`/work-orders/${result.id}`),
      onCancel: () => navigate(listPath),
    });
  };

  const handleSubmit = async (values: Record<string, unknown>) => {
    console.log(`[新建${orderTypeLabel}工单] onFinish 触发，提交值：`, values);
    setSubmitting(true);
    try {
      const result = await createWorkOrder(buildPayload(values));
      showSplitResult(result);
    } catch (err) {
      console.error(`[新建${orderTypeLabel}工单] 提交失败：`, err);
      message.error('提交失败');
    } finally { setSubmitting(false); }
  };

  const handleSubmitClick = async () => {
    try {
      console.log(`[新建${orderTypeLabel}工单] 点击提交，开始校验表单`);
      await formRef.current?.validateFields();
      formRef.current?.submit();
    } catch (err) {
      console.error(`[新建${orderTypeLabel}工单] 表单校验失败：`, err);
      message.error('表单校验未通过，请检查红色提示字段');
    }
  };

  if (isReadonlyViewer) {
    return (
      <PageContainer header={{ title: `新建${orderTypeLabel}工单` }}>
        <Result status="403" title="无操作权限"
          subTitle="业务负责人仅可查看和导出工单，不可新建或操作工单。"
          extra={<Button type="primary" onClick={() => navigate(listPath)}>返回{orderTypeLabel}主工单列表</Button>} />
      </PageContainer>
    );
  }

  return (
    <PageContainer header={{
      title: `新建${orderTypeLabel}工单`,
    }}>
      <Card>
        <DynamicForm
          fields={allFields}
          fieldPermissions={permissions}
          conditionalRequired={conditionalRequired}
          orderType={orderType}
          formRef={formRef}
          onFinish={handleSubmit}
          hideSubmit
          loading={submitting}
        />

        <Divider />
        <Space>
          <Button type="primary" icon={<SendOutlined />} onClick={handleSubmitClick} loading={submitting}>提交并拆分工单</Button>
          <Button onClick={() => navigate(listPath)}>返回{orderTypeLabel}主工单列表</Button>
        </Space>
      </Card>
    </PageContainer>
  );
};

export default WorkOrdersNew;
