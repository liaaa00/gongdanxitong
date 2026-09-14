import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import type { ProFormInstance } from '@ant-design/pro-components';
import { Card, Button, Space, App, Divider, Result } from 'antd';
import { SendOutlined, CheckCircleOutlined } from '@ant-design/icons';
import DynamicForm from '@/components/DynamicForm';
import type { FieldConfig } from '@/components/DynamicForm';
import { CONDITIONAL_REQUIRED_BY_TYPE } from './conditionalRequired';
export { CONDITIONAL_REQUIRED_BY_TYPE } from './conditionalRequired';
import { useFieldPermissions } from '@/hooks/useFieldPermissions';
import { getCreateWorkOrderFields } from '@/services/importTemplates';
import { checkResignationInjuryWarning, createWorkOrder, submitWorkOrder } from '@/services/workOrders';
import { getCustomers, getFallbackCustomers, type CustomerItem } from '@/services/customers';
import { useAuth } from '@/hooks/useAuth';
import MaterialsUpload, { type MaterialsUploadHandle } from '@/components/MaterialsUpload';

type SupportedOrderType = 'onboarding' | 'resignation';

const ORDER_TYPE_LABEL: Record<SupportedOrderType, string> = {
  onboarding: '入职',
  resignation: '离职',
};

function getOrderTypeFromSearch(search: string): SupportedOrderType {
  const value = new URLSearchParams(search).get('orderType');
  return value === 'resignation' ? 'resignation' : 'onboarding';
}

// 业务员发起（单条新增）阶段不展示后道办理岗反馈字段，口径与入职导入模板一致（业务规则清单 17）：
// 这三个字段由对应子工单办理岗在子单完成时填写，不属于发起表单。
// 注意：contract_template（劳动合同模板）虽不进导入模板，但在单条新增中是「企服发起劳动合同」的
// 条件必填发起字段（见 CONDITIONAL_REQUIRED_BY_TYPE），必须保留，不能为对齐导入模板而移除。
export const AGENT_INITIATED_EXCLUDED_FIELD_CODES = new Set([
  'contract_term',
  'probation_months',
  'contract_feedback',
  'onboarding_feedback',
  'data_entry_feedback',
]);

export function excludeBackofficeFeedbackFields<T extends { field_code: string }>(list: T[]): T[] {
  return list.filter((f) => !AGENT_INITIATED_EXCLUDED_FIELD_CODES.has(f.field_code));
}

export function canCreateMainWorkOrderByRole(hasRole: (roleCode: string) => boolean): boolean {
  return hasRole('admin') || hasRole('business_group_leader') || hasRole('business_group_member');
}

export function isReadonlyBusinessViewer(hasRole: (roleCode: string) => boolean): boolean {
  return hasRole('business_owner') && !canCreateMainWorkOrderByRole(hasRole);
}

export function requiresResignationAttachment(
  orderType: SupportedOrderType,
  values: Record<string, unknown>,
): boolean {
  return orderType === 'resignation'
    && String(values.need_resignation_share ?? '').trim() === '否';
}

const WorkOrdersNew: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { message, modal } = App.useApp();
  const { hasRole } = useAuth();
  const formRef = useRef<ProFormInstance>();
  const materialsRef = useRef<MaterialsUploadHandle>(null);
  const orderType = useMemo(() => getOrderTypeFromSearch(location.search), [location.search]);
  const orderTypeLabel = ORDER_TYPE_LABEL[orderType];
  const listPath = `/work-orders?orderType=${orderType}`;
  const conditionalRequired = CONDITIONAL_REQUIRED_BY_TYPE[orderType];
  const { permissions } = useFieldPermissions(`create:${orderType}`);
  const [allFields, setAllFields] = useState<FieldConfig[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [createdWorkOrderId, setCreatedWorkOrderId] = useState<string | null>(null);

  const isReadonlyViewer = isReadonlyBusinessViewer(hasRole);

  useEffect(() => {
    formRef.current?.resetFields?.();
    getCreateWorkOrderFields(orderType)
      .then((fields) => setAllFields(excludeBackofficeFeedbackFields(fields as FieldConfig[])))
      .catch(() => {
        setAllFields([]);
        message.error(`加载${orderTypeLabel}新建字段配置失败`);
      });
  }, [message, orderType, orderTypeLabel]);

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
      _action: 'draft',
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

  const confirmInjuryReminder = (content: string): Promise<boolean> => new Promise((resolve) => {
    modal.confirm({
      title: '工伤减员提醒',
      content,
      okText: '继续发起离职',
      cancelText: '返回检查',
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });

  const handleSubmit = async (values: Record<string, unknown>) => {
    console.log(`[新建${orderTypeLabel}工单] onFinish 触发，提交值：`, values);
    setSubmitting(true);
    try {
      if (orderType === 'resignation') {
        const idCardNo = String(values.id_card_no || values.employee_id_card || '').trim();
        if (idCardNo) {
          const warning = await checkResignationInjuryWarning(idCardNo);
          if (warning.hasInjuryRecord) {
            const confirmed = await confirmInjuryReminder(
              warning.message || '该员工存在工伤申请记录，减员时需同步办理一次性医疗补助金申请',
            );
            if (!confirmed) return;
          }
        }
      }
      const attachmentRequired = requiresResignationAttachment(orderType, values);
      if (attachmentRequired && !materialsRef.current?.hasStaged()) {
        message.error('不进行离职材料采集时，附件至少上传一份');
        return;
      }

      const draft = await createWorkOrder(buildPayload(values));
      setCreatedWorkOrderId(draft.id as string);
      try {
        await materialsRef.current?.uploadStaged(draft.id as string);
      } catch {
        message.error('部分附件上传失败，请在工单详情页重试');
        if (attachmentRequired) return;
      }
      const result = await submitWorkOrder(draft.id as string);
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

      <Card title="附件上传" style={{ marginTop: 16 }}>
        <MaterialsUpload
          ref={materialsRef}
          workOrderId={createdWorkOrderId || ''}
          bizPurpose={orderType === 'onboarding' ? 'onboarding_material' : 'resignation_material'}
        />
      </Card>
    </PageContainer>
  );
};

export default WorkOrdersNew;
