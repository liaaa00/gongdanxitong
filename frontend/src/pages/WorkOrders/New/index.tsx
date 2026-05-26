import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import type { ProFormInstance } from '@ant-design/pro-components';
import { Card, Button, Space, App, Divider, Result, Alert, Tag, Collapse, Steps, Descriptions } from 'antd';
import { SendOutlined, InfoCircleOutlined, CheckCircleOutlined, SplitCellsOutlined } from '@ant-design/icons';
import DynamicForm from '@/components/DynamicForm';
import type { FieldConfig, ConditionalRequired } from '@/components/DynamicForm';
import { useFieldPermissions } from '@/hooks/useFieldPermissions';
import { getFallbackFields, getFields } from '@/services/fields';
import { createWorkOrder } from '@/services/workOrders';
import { getCustomers, getFallbackCustomers, type CustomerItem } from '@/services/customers';
import { useAuth } from '@/hooks/useAuth';
import { ONBOARDING_SPLIT_MODULES, getModuleColor, getModuleLabel } from '@/constants/modules';

// 条件联动规则
const CONDITIONAL_REQUIRED: ConditionalRequired[] = [
  { field: 'need_company_contract', value: '是', requireFields: ['contract_subject', 'contract_template', 'need_contract_urge'] },
  { field: 'need_company_payroll', value: '是', requireFields: ['payroll_location'] },
];

// 子工单模块信息：页面只展示中文，内部模块码仅作为请求参数使用
const SUB_TICKET_INFO: Record<string, { label: string; color: string; desc: string; handler: string; required?: boolean }> = {
  data_entry: { label: '数据录入', color: 'blue', desc: '所有入职数据自动流转至数据录入岗，由数据录入组长统一处理。', handler: '数据录入组长（安娜祯）', required: true },
  social_insurance: { label: '社保公积金办理', color: 'purple', desc: '所有入职工单固定生成，用于办理社保、公积金增员、基数等事项。', handler: '社保公积金负责人（后台配置）', required: true },
  onboarding_contact: { label: '入职联系', color: 'cyan', desc: '由共享团队办理员工入职联络事宜（入职通知、资料确认等）。', handler: '入离职联系专员（毛雅妮）' },
  contract: { label: '劳动合同签订', color: 'green', desc: '由合同组负责签署劳动合同及相关文件。', handler: '合同专员（杨纯）' },
};

const WorkOrdersNew: React.FC = () => {
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const { hasRole } = useAuth();
  const formRef = useRef<ProFormInstance>();
  const { permissions } = useFieldPermissions('main');
  const [allFields, setAllFields] = useState<FieldConfig[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [splitPreview, setSplitPreview] = useState<string[]>(['data_entry', 'social_insurance']);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);

  const isReadonlyViewer = hasRole('business_owner') && !hasRole('admin');

  // 按采集分组整理字段（仅用于说明信息展示）
  const fieldGroups = useMemo(() => {
    const groups: Record<string, FieldConfig[]> = {};
    for (const f of allFields) {
      const g = f.collection_group || '其他';
      if (!groups[g]) groups[g] = [];
      groups[g].push(f);
    }
    return groups;
  }, [allFields]);

  // 计算拆分预览
  const computeSplit = useCallback((values: Record<string, unknown>) => {
    const splits = ['data_entry', 'social_insurance'];
    if (String(values.need_onboarding_contact ?? '否') === '是') splits.push('onboarding_contact');
    if (String(values.need_company_contract ?? '否') === '是') splits.push('contract');
    setSplitPreview(splits);
  }, []);

  useEffect(() => {
    if (!hasRole('admin')) {
      setAllFields(getFallbackFields('onboarding'));
      computeSplit({});
      return;
    }
    getFields('onboarding')
      .then((list) => {
        setAllFields(list);
        computeSplit({});
      })
      .catch(() => message.error('加载字段配置失败'));
  }, [computeSplit, hasRole, message]);

  // ★ 加载客户列表用于根据客户名称/代码自动匹配后端所需 UUID customerId
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
      orderType: 'onboarding',
      _action: 'submit',
    };
  };

  const handleValuesChange = (_changed: Record<string, unknown>, allValues: Record<string, unknown>) => {
    setFormValues(allValues);
    computeSplit(allValues);
  };


  const showSplitResult = (result: any) => {
    modal.confirm({
      title: <span>🎉 工单提交成功</span>,
      icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
      width: 560,
      closable: true,
      maskClosable: true,
      content: (
        <div style={{ lineHeight: 2 }}>
          <p>工单 <strong>{result.order_no}</strong> 已提交，系统已自动拆分为以下 {splitPreview.length} 个子工单：</p>
          <Descriptions column={1} size="small" bordered style={{ marginTop: 8 }}>
            {splitPreview.map((code) => {
              const info = SUB_TICKET_INFO[code];
              return (
                <Descriptions.Item key={code} label={<Tag color={info?.color}>{info?.label}</Tag>}>
                  {info?.desc}
                  <br /><small style={{ color: '#999' }}>办理人：{info?.handler}</small>
                </Descriptions.Item>
              );
            })}
          </Descriptions>
          <Alert style={{ marginTop: 12 }} type="info" showIcon
            message="后续办理情况可在「我的工单」中查看，也可以先关闭窗口继续操作。" />
        </div>
      ),
      okText: '查看工单详情',
      cancelText: '关闭',
      onOk: () => navigate(`/work-orders/${result.id}`),
      onCancel: () => navigate('/work-orders'),
    });
  };

  const handleSubmit = async (values: Record<string, unknown>) => {
    console.log('[新建入职工单] onFinish 触发，提交值：', values);
    setSubmitting(true);
    try {
      const result = await createWorkOrder(buildPayload(values));
      showSplitResult(result);
    } catch (err) {
      console.error('[新建入职工单] 提交失败：', err);
      message.error('提交失败');
    } finally { setSubmitting(false); }
  };

  const handleSubmitClick = async () => {
    try {
      console.log('[新建入职工单] 点击提交，开始校验表单');
      await formRef.current?.validateFields();
      formRef.current?.submit();
    } catch (err) {
      console.error('[新建入职工单] 表单校验失败：', err);
      message.error('表单校验未通过，请检查红色提示字段');
    }
  };

  if (isReadonlyViewer) {
    return (
      <PageContainer header={{ title: '新建入职工单' }}>
        <Result status="403" title="无操作权限"
          subTitle="业务负责人仅可查看和导出工单，不可新建或操作工单。"
          extra={<Button type="primary" onClick={() => navigate('/work-orders')}>返回工单列表</Button>} />
      </PageContainer>
    );
  }

  const needContract = String(formValues.need_company_contract ?? '否') === '是';
  const needContact = String(formValues.need_onboarding_contact ?? '否') === '是';

  // 构建分组标签信息
  const groupOrder = ['基本信息', '合同与用工信息', '薪资与发薪信息', '社保公积金信息', '业务判断项', '备注与反馈'];

  return (
    <PageContainer header={{
      title: '新建入职工单',
      subTitle: '填写入职信息采集表 · 系统根据流程判断项自动拆分为子工单',
    }}>
      {/* 操作说明 */}
      <Collapse style={{ marginBottom: 16 }} size="small"
        items={[{
          key: 'guide',
          label: <span><InfoCircleOutlined /> 工单拆分规则说明</span>,
          children: (
            <Steps size="small" direction="vertical" current={-1}
              items={[
                { title: '填写入职信息采集表', description: '客户填报与业务员补充的字段均已按采集分组整理，按序填写即可' },
                { title: '选择流程判断项', description: '"是否需要入职联系" → 是 → 拆分入职联系子工单；"是否企服发起劳动合同" → 是 → 拆分合同签订子工单' },
                { title: '提交工单', description: '数据录入、社保公积金办理始终生成；入职联系和劳动合同签订按原条件生成。提交后由对应人员在我的待办中处理。' },
              ]}
            />
          ),
        }]}
      />

      {/* 拆分预览面板 */}
      <Alert style={{ marginBottom: 16 }} type="info" showIcon icon={<SplitCellsOutlined />}
        message={
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            <Space size={[4, 8]} wrap>
              <span><strong>子工单拆分预览：</strong></span>
              {ONBOARDING_SPLIT_MODULES.map((mod) => {
                const generated = splitPreview.includes(mod.code);
                const info = SUB_TICKET_INFO[mod.code];
                return (
                  <Tag
                    key={mod.code}
                    color={generated ? (info?.color || getModuleColor(mod.code)) : 'default'}
                    icon={generated ? <CheckCircleOutlined /> : undefined}
                    style={!generated ? { color: '#999' } : undefined}
                  >
                    {info?.label || getModuleLabel(mod.code)}：{generated ? (info?.required ? '必生成' : '将生成') : '本次不生成'}
                  </Tag>
                );
              })}
              <span style={{ color: '#999', fontSize: 12 }}>
                （将生成 {splitPreview.length} 个子工单）
              </span>
            </Space>
            <span style={{ color: '#666', fontSize: 12 }}>
              数据录入、社保公积金办理为固定必生成；入职联系、劳动合同签订按流程判断项生成。
            </span>
          </Space>
        }
      />

      <Card>
        {/* 分组说明标签 */}
        <div style={{ marginBottom: 16 }}>
          <Space wrap size={[4, 4]}>
            <span style={{ fontWeight: 600, marginRight: 8 }}>采集分组：</span>
            {groupOrder.map((g) => {
              if (!fieldGroups[g]?.length) return null;
              const isJudgment = g === '流程判断';
              return (
                <Tag key={g} color={isJudgment ? 'red' : 'default'}>
                  {isJudgment ? '⚡ ' : '📋 '}{g}（{fieldGroups[g].length}个字段）
                </Tag>
              );
            })}
          </Space>
        </div>

        {/* 统一动态表单（单个 ProForm 实例）：客户信息直接在表单字段内填写/展示，不再额外显示独立“客户”选择框 */}
        <DynamicForm
          fields={allFields}
          fieldPermissions={permissions}
          conditionalRequired={CONDITIONAL_REQUIRED}
          orderType="onboarding"
          formRef={formRef}
          onFinish={handleSubmit}
          onValuesChange={handleValuesChange}
          hideSubmit
          loading={submitting}
        />

        {/* 判断项结果提示 */}
        {(needContract || !needContact) && (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 12 }}
            message={
              <Space direction="vertical" size={2}>
                {needContract
                  ? <span>✅ 「企服发起劳动合同」为<strong>是</strong> → 将拆分 <Tag color="green">劳动合同签订</Tag> 子工单</span>
                  : <span>「企服发起劳动合同」为<strong>否</strong> → 不生成劳动合同签订子工单</span>}
                {needContact
                  ? <span>✅ 「需要入职联系」为<strong>是</strong> → 将拆分 <Tag color="cyan">入职联系</Tag> 子工单</span>
                  : <span>「需要入职联系」为<strong>否</strong> → 不生成入职联系子工单</span>}
                <span style={{ color: '#999', fontSize: 12 }}>💡 数据录入、社保公积金办理子工单始终生成；另两类子工单按条件生成。</span>
              </Space>
            }
          />
        )}

        <Divider />
        <Space>
          <Button type="primary" icon={<SendOutlined />} onClick={handleSubmitClick} loading={submitting}>提交并拆分工单</Button>
          <Button onClick={() => navigate('/work-orders')}>返回列表</Button>
        </Space>
      </Card>
    </PageContainer>
  );
};

export default WorkOrdersNew;
