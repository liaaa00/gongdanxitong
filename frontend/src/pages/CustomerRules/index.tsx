import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import {
  Alert, App, Button, Card, Col, Descriptions, Drawer, Form, Input, InputNumber,
  Modal, Popconfirm, Row, Select, Space, Switch, Table, Tabs, Tag, Typography,
} from 'antd';
import { ArrowRightOutlined, EditOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import RuleBatchActions from './RuleBatchActions';
import LocationRulesEditor from './LocationRulesEditor';
import { COMPLETE_BUSINESS_TYPES, CUSTOMER_RULE_FIELD_LABELS, DEFAULT_RESULT_FIELDS } from './ruleExcel';
import {
  fillPendingCustomerRules, getCustomerRule, getCustomerRules, updateCustomerRule,
  type CustomerRuleItem, type FillPendingRulesResult, type RuleValue, type SaveCustomerRuleInput,
} from '@/services/customerRules';

const YES_NO_OPTIONS = [{ label: '是', value: true }, { label: '否', value: false }];
const hasRuleValue = (value: unknown) => value !== undefined && value !== null && (typeof value !== 'string' || value.trim() !== '');
const definedDefaults = (values: Record<string, RuleValue> = {}) => Object.fromEntries(Object.entries(values).filter(([, value]) => hasRuleValue(value)));
interface CustomerRulesProps { embedded?: boolean }

const CustomerRules: React.FC<CustomerRulesProps> = ({ embedded = false }) => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm<SaveCustomerRuleInput>();
  const [data, setData] = useState<CustomerRuleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [current, setCurrent] = useState<CustomerRuleItem | null>(null);
  const [activeTab, setActiveTab] = useState('onboarding');
  const [filling, setFilling] = useState(false);
  const [fillResult, setFillResult] = useState<FillPendingRulesResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [appliedKeyword, setAppliedKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const autoOpenedCustomerId = useRef<string | null>(null);

  const setDetailForm = (detail: CustomerRuleItem) => {
    form.setFieldsValue({
      onboardingDefaults: detail.onboardingDefaults || {},
      resignationDefaults: detail.resignationDefaults || {},
      paymentLocationRules: detail.paymentLocationRules || [],
      salaryRules: detail.salaryRules || { billingDay: null, reminderEnabled: true, reminderWorkdayOffsets: [3, 2, 1] },
      sharedEmailRules: detail.sharedEmailRules || { mailbox: '', routeKey: '' },
      completionEmailEnabled: detail.completionEmailEnabled,
      completionEmailTo: detail.completionEmailTo || [],
      completionEmailCc: detail.completionEmailCc || [],
      completionEmailReplyTo: detail.completionEmailReplyTo,
      completionEmailBusinessTypes: [...COMPLETE_BUSINESS_TYPES],
      completionEmailFields: detail.completionEmailFields?.length ? detail.completionEmailFields : DEFAULT_RESULT_FIELDS,
      objectionDeadlineDays: detail.objectionDeadlineDays,
      isActive: detail.isActive,
    });
  };

  const load = async (nextPage = page, nextPageSize = pageSize, nextKeyword = appliedKeyword) => {
    setLoading(true);
    try {
      const result = await getCustomerRules({ page: nextPage, pageSize: nextPageSize, keyword: nextKeyword || undefined });
      setData(Array.isArray(result.list) ? result.list : []);
      setTotal(result.total || 0);
    } catch (error: any) {
      message.error(error?.message || '客户规则加载失败，请确认本地后端已启动');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(1, pageSize, ''); }, []);

  const openRule = async (record: Pick<CustomerRuleItem, 'customerId'>) => {
    setDrawerOpen(true);
    setCurrent(null);
    setActiveTab('onboarding');
    setFillResult(null);
    setSaveError(null);
    form.resetFields();
    try {
      const detail = await getCustomerRule(record.customerId);
      setCurrent(detail);
      setDetailForm(detail);
    } catch (error: any) {
      message.error(error?.message || '客户规则详情加载失败');
      setDrawerOpen(false);
    }
  };

  useEffect(() => {
    const customerId = searchParams.get('customerId');
    if (!customerId || autoOpenedCustomerId.current === customerId) return;
    autoOpenedCustomerId.current = customerId;
    void openRule({ customerId });
  }, [data, searchParams]);

  const save = async () => {
    if (!current) return;
    setSaveError(null);
    let values: SaveCustomerRuleInput;
    try { await form.validateFields(); values = form.getFieldsValue(true); } catch { return; }
    const onboarding = values.onboardingDefaults || {};
    if (Object.values(onboarding).some(hasRuleValue) && !String(onboarding.employee_type ?? '').trim()) {
      setActiveTab('onboarding');
      const errorMessage = '填写入职规则时必须配置员工类型';
      setSaveError(errorMessage);
      form.setFields([{ name: ['onboardingDefaults', 'employee_type'], errors: [errorMessage] }]);
      return;
    }
    const payload: SaveCustomerRuleInput = {
      ...values,
      onboardingDefaults: Object.fromEntries(Object.entries(values.onboardingDefaults || {}).map(([key, value]) => [key, value === undefined || value === '' ? null : value])),
      resignationDefaults: Object.fromEntries(Object.entries(values.resignationDefaults || {}).map(([key, value]) => [key, value === undefined || value === '' ? null : value])),
      paymentLocationRules: (values.paymentLocationRules || []).map((rule) => ({
        ...rule, socialLocation: rule.socialLocation?.trim(), branchId: rule.branchId?.trim(),
        onboardingDefaults: definedDefaults(rule.onboardingDefaults), resignationDefaults: definedDefaults(rule.resignationDefaults),
      })),
      completionEmailReplyTo: values.completionEmailReplyTo || null,
      salaryRules: { ...values.salaryRules, reminderWorkdayOffsets: [3, 2, 1] },
      completionEmailBusinessTypes: [...COMPLETE_BUSINESS_TYPES],
    };
    setSaving(true);
    try {
      await updateCustomerRule(current.customerId, payload);
      const persisted = await getCustomerRule(current.customerId);
      setCurrent(persisted);
      form.resetFields();
      setDetailForm(persisted);
      await load();
      setSaveError(null);
      message.success('客户规则已保存并从服务端重新读取');
    } catch (error: any) {
      const errorMessage = error?.message || '客户规则保存失败';
      setSaveError(errorMessage);
      message.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const fillPending = async () => {
    if (!current) return;
    setFilling(true);
    try {
      const result = await fillPendingCustomerRules(current.customerId);
      setFillResult(result);
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '填充待提交草稿失败');
    } finally {
      setFilling(false);
    }
  };

  const content = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <RuleBatchActions keyword={appliedKeyword} onComplete={() => load()} />
        <Button icon={<ReloadOutlined />} onClick={() => load()} loading={loading}>刷新</Button>
      </div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="按客户维护办理规则和通知邮箱"
        description="模板下载与历史带入处理当前查询结果中的全部客户。Excel空白保留已有配置；通知收件人请按业务用途维护。"
        action={<Button type="link" onClick={() => navigate('/customer-config?tab=customers')}>返回客户资料 <ArrowRightOutlined /></Button>}
      />
      <Card>
        <Space.Compact style={{ width: 420, maxWidth: '100%', marginBottom: 16 }}>
          <Input value={keyword} allowClear placeholder="按客户名称或客户编码搜索" onChange={(event) => setKeyword(event.target.value)} onPressEnter={() => { setPage(1); setAppliedKeyword(keyword); void load(1, pageSize, keyword); }} />
          <Button type="primary" icon={<SearchOutlined />} onClick={() => { setPage(1); setAppliedKeyword(keyword); void load(1, pageSize, keyword); }}>查询</Button>
        </Space.Compact>
        <Table<CustomerRuleItem>
          rowKey="customerId" loading={loading} dataSource={data} scroll={{ x: 760 }}
          columns={[
            { title: '客户编码', dataIndex: 'customerCode', width: 170 },
            { title: '客户名称', dataIndex: 'customerName', width: 220 },
            { title: '配置状态', width: 220, render: (_, record) => record.readiness?.ready
              ? <Tag color="success">可开通门户</Tag>
              : <Space size={4} wrap><Tag color="warning">待完善</Tag><Typography.Text type="secondary">{record.readiness?.missing?.join('、') || '规则未保存'}</Typography.Text></Space> },
            { title: '规则状态', width: 110, render: (_, record) => <Tag color={record.isActive ? 'processing' : 'default'}>{record.isActive ? '启用' : '停用'}</Tag> },
            { title: '更新时间', dataIndex: 'updatedAt', width: 180, render: (value) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-' },
            { title: '操作', fixed: 'right', width: 100, render: (_, record) => <Button type="link" icon={<EditOutlined />} onClick={() => openRule(record)}>配置</Button> },
          ]}
          pagination={{ current: page, pageSize, total, showSizeChanger: true, onChange: (nextPage, nextPageSize) => { setPage(nextPage); setPageSize(nextPageSize); void load(nextPage, nextPageSize, appliedKeyword); } }}
        />
      </Card>

      <Drawer
        open={drawerOpen} width="min(880px, 100vw)" title={current ? `客户规则 · ${current.customerName}` : '客户规则'}
        onClose={() => setDrawerOpen(false)}
        extra={<Space wrap><Popconfirm title="使用已保存规则填充待提交草稿？" description="只填空白字段，保留已填写内容。页面修改请先保存。" okText="开始填充" cancelText="取消" onConfirm={fillPending}>
          <Button loading={filling} disabled={!current?.configured || saving}>填充待提交草稿</Button>
        </Popconfirm><Button onClick={() => setDrawerOpen(false)}>关闭</Button><Button type="primary" loading={saving} onClick={() => void save()}>保存并校验</Button></Space>}
      >
        {current && <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered style={{ marginBottom: 16 }} items={[
          { key: 'code', label: '客户编码', children: current.customerCode },
          { key: 'id', label: '客户 ID', children: <Typography.Text copyable>{current.customerId}</Typography.Text> },
          { key: 'status', label: '持久化状态', children: current.configured ? <Tag color="success">已保存</Tag> : <Tag>尚未保存</Tag> },
          { key: 'updated', label: '最后更新', children: current.updatedAt ? new Date(current.updatedAt).toLocaleString('zh-CN', { hour12: false }) : '-' },
        ]} />}
        {saveError && <Alert type="error" showIcon message={saveError} style={{ marginBottom: 16 }} />}
        <Form form={form} layout="vertical" initialValues={{
          onboardingDefaults: {}, resignationDefaults: {}, paymentLocationRules: [],
          salaryRules: { billingDay: null, reminderEnabled: true, reminderWorkdayOffsets: [3, 2, 1] },
          sharedEmailRules: { mailbox: '', routeKey: '' }, completionEmailEnabled: false,
          completionEmailTo: [], completionEmailCc: [], completionEmailBusinessTypes: [...COMPLETE_BUSINESS_TYPES],
          completionEmailFields: DEFAULT_RESULT_FIELDS, isActive: true,
        }}>
          <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
            { key: 'onboarding', label: '入职规则', children: <Row gutter={16}>
              <Col xs={24} md={12}><Form.Item name={['onboardingDefaults', 'business_mode']} label="业务模式"><Input /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name={['onboardingDefaults', 'outsource_type']} label="外包类型"><Input /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name={['onboardingDefaults', 'employee_type']} label="员工类型" extra="填写任一入职规则时必填；仅配置薪资可保持整组入职规则为空。"><Input /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name={['onboardingDefaults', 'fund_ratio']} label="公积金比例"><Input placeholder="例如：5%+5%" /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name={['onboardingDefaults', 'contract_subject']} label="合同主体"><Input /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name={['onboardingDefaults', 'company_address']} label="企业地址"><Input /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name={['onboardingDefaults', 'project_name']} label="项目名称"><Input /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name={['onboardingDefaults', 'work_arrangement']} label="工作安排"><Input /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name={['onboardingDefaults', 'need_company_contract']} label="需要企业合同"><Select allowClear options={YES_NO_OPTIONS} /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name={['onboardingDefaults', 'need_esign']} label="需要电子签"><Select allowClear options={YES_NO_OPTIONS} /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name={['onboardingDefaults', 'esign_platform']} label="电子签平台"><Select allowClear options={['速创', 'E签宝'].map((value) => ({ label: value, value }))} /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name={['onboardingDefaults', 'contract_template']} label="合同模板"><Input /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name={['onboardingDefaults', 'need_onboarding_contact']} label="需要入职联系"><Select allowClear options={YES_NO_OPTIONS} /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name={['onboardingDefaults', 'need_company_payroll']} label="企业发薪"><Select allowClear options={YES_NO_OPTIONS} /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name={['onboardingDefaults', 'payroll_location']} label="发薪地"><Input /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name={['onboardingDefaults', 'payroll_cycle']} label="发薪月份"><Select allowClear options={['当月', '次月'].map((value) => ({ label: value, value }))} /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name={['onboardingDefaults', 'payroll_date']} label="发薪日" rules={[{ pattern: /^(?:[1-9]|[12]\d|3[01])$/, message: '请输入1至31的整数' }]}><Input placeholder="1至31" addonAfter="日" maxLength={2} /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name={['onboardingDefaults', 'need_payroll_slip']} label="是否需要工资单"><Select allowClear options={['是', '否'].map((value) => ({ label: value, value }))} /></Form.Item></Col>
              <Col span={24}><Alert type="info" showIcon style={{ marginBottom: 16 }} message="已购产品、服务费和押金为选填办理提醒" /></Col>
              <Col xs={24} md={12}><Form.Item name={['onboardingDefaults', 'purchased_products']} label="已购产品"><Input /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name={['onboardingDefaults', 'service_fee']} label="服务费提醒"><Input /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name={['onboardingDefaults', 'deposit']} label="押金提醒"><Input /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name={['onboardingDefaults', 'need_contract_urge']} label="催签合同"><Select allowClear options={YES_NO_OPTIONS} /></Form.Item></Col>
              <Col span={24}><Form.Item name={['onboardingDefaults', 'social_urge']} label="社保/公积金催办规则"><Input.TextArea rows={2} /></Form.Item></Col>
              <Col span={24}><Form.Item name={['onboardingDefaults', 'special_remark']} label="特殊说明"><Input.TextArea rows={3} /></Form.Item></Col>
            </Row> },
            { key: 'resignation', label: '离职规则', children: <>
              <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="离职证明仅在后台配置" description="客户门户不展示、不填写，也不能覆盖以下内容；创建离职业务时系统会自动带入。" />
              <Row gutter={16}>
                <Col xs={24} md={12}><Form.Item name={['resignationDefaults', 'need_resignation_cert']} label="是否开具离职证明"><Select allowClear options={['是', '否'].map((value) => ({ label: value, value }))} /></Form.Item></Col>
                <Col xs={24} md={12}><Form.Item name={['resignationDefaults', 'cert_delivery_method']} label="证明形式"><Select allowClear options={['电子版', '纸质版', '电子版和纸质版'].map((value) => ({ label: value, value }))} /></Form.Item></Col>
                <Col xs={24} md={12}><Form.Item name={['resignationDefaults', 'certificate_template']} label="证明模板"><Input placeholder="模板名称或模板编码" /></Form.Item></Col>
                <Col xs={24} md={12}><Form.Item name={['resignationDefaults', 'cert_delivery_address']} label="送达地址" dependencies={[['resignationDefaults', 'need_resignation_cert']]} rules={[({ getFieldValue }) => ({ required: getFieldValue(['resignationDefaults', 'need_resignation_cert']) === '是', message: '需要开具离职证明时请填写送达地址' })]}><Input placeholder="邮箱或邮寄地址" /></Form.Item></Col>
              </Row>
            </> },
            { key: 'locations', label: '缴纳地与商社', children: current ? <LocationRulesEditor customerId={current.customerId} form={form} /> : null },
            { key: 'salary', label: '薪资规则', children: <>
              <Alert type="info" showIcon style={{ marginBottom: 16 }} message="提醒节奏为会议最终口径，不允许修改" description="账单日前 3 个工作日提醒客户，前 2 个工作日再次提醒客户，前 1 个工作日升级提醒业务员。" />
              <Row gutter={16}>
                <Col xs={24} md={12}><Form.Item name={['salaryRules', 'billingDay']} label="每月账单日"><InputNumber min={1} max={28} precision={0} addonAfter="日" style={{ width: '100%' }} /></Form.Item></Col>
                <Col xs={24} md={12}><Form.Item name={['salaryRules', 'reminderEnabled']} label="启用薪资提醒" valuePropName="checked"><Switch checkedChildren="启用" unCheckedChildren="停用" /></Form.Item></Col>
                <Col xs={24} md={12}><Form.Item name={['salaryRules', 'payrollMonthMode']} label="薪资发薪周期"><Select allowClear placeholder="选择薪资所属月份" options={[{ label: '当月发当月', value: 'current' }, { label: '当月发上月', value: 'previous' }]} /></Form.Item></Col>
              </Row>
              <Space wrap><Tag color="blue">前 3 个工作日 · 首次提醒客户</Tag><Tag color="geekblue">前 2 个工作日 · 再次提醒客户</Tag><Tag color="orange">前 1 个工作日 · 升级提醒业务员</Tag></Space>
            </> },
            { key: 'shared-email', label: '共享邮箱', children: <>
              <Alert type="info" showIcon style={{ marginBottom: 16 }} message="入职、离职、薪资附件全部走共享邮箱" description="此配置仅供内部连接器路由附件，不会展示给客户，也不绑定内部工单附件 ID。" />
              <Form.Item name={['sharedEmailRules', 'mailbox']} label="共享邮箱地址" rules={[{ type: 'email', message: '请输入有效邮箱地址' }]}><Input placeholder="shared@example.com" /></Form.Item>
              <Form.Item name={['sharedEmailRules', 'routeKey']} label="路由标识" extra="用于共享邮箱服务识别客户或业务线路"><Input placeholder="例如：customer-code 或 routing-key" /></Form.Item>
              <Space wrap><Tag color="processing">入职附件</Tag><Tag color="processing">离职附件</Tag><Tag color="processing">薪资附件</Tag></Space>
            </> },
            { key: 'completion-email', label: '办结结果邮件', children: <>
              <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="三类业务全部纳入办结邮件" description="系统办结后按本页配置向客户指定联系人发送结果；业务类型为固定范围，不能取消其中某一类。" />
              <Form.Item name="completionEmailEnabled" label="启用办结结果邮件" valuePropName="checked"><Switch checkedChildren="启用" unCheckedChildren="停用" /></Form.Item>
              <Form.Item noStyle shouldUpdate={(previous, next) => previous.completionEmailEnabled !== next.completionEmailEnabled}>
                {({ getFieldValue }) => {
                  const enabled = getFieldValue('completionEmailEnabled');
                  return <>
                    <Form.Item name="completionEmailTo" label="收件人" rules={enabled ? [{ required: true, type: 'array', min: 1, message: '启用邮件时至少填写一个收件人' }] : []}><Select mode="tags" tokenSeparators={[',', ';']} placeholder="customer@example.com" options={[]} /></Form.Item>
                    <Form.Item name="completionEmailCc" label="抄送"><Select mode="tags" tokenSeparators={[',', ';']} placeholder="可选邮箱" options={[]} /></Form.Item>
                    <Form.Item name="completionEmailReplyTo" label="回复地址" rules={[{ type: 'email', message: '请输入有效邮箱' }]}><Input placeholder="可选，默认使用公共邮箱" /></Form.Item>
                    <Form.Item label="适用业务"><Space wrap><Tag color="success">入职办理</Tag><Tag color="success">离职办理</Tag><Tag color="success">薪资办理</Tag></Space></Form.Item>
                    <Form.Item name="completionEmailFields" label="结果字段"><Select mode="tags" tokenSeparators={[',', ';']} options={DEFAULT_RESULT_FIELDS.map((value) => ({ label: value, value }))} /></Form.Item>
                    <Form.Item name="objectionDeadlineDays" label="客户异议期限（天）"><InputNumber min={0} max={30} precision={0} /></Form.Item>
                  </>;
                }}
              </Form.Item>
            </> },
          ]} />
          <Form.Item name="isActive" label="整套客户规则启用" valuePropName="checked"><Switch checkedChildren="启用" unCheckedChildren="停用" /></Form.Item>
        </Form>
      </Drawer>
      <Modal open={fillResult !== null} title="待提交草稿填充明细" width={900} zIndex={1500} footer={<Button onClick={() => setFillResult(null)}>关闭明细</Button>} onCancel={() => setFillResult(null)}>
        {fillResult && <>
          <Alert type={fillResult.failedCount ? 'warning' : 'info'} showIcon message={`共 ${fillResult.total} 张草稿，已填充 ${fillResult.updatedCount} 张，跳过 ${fillResult.skippedCount} 张，失败 ${fillResult.failedCount || 0} 张`} style={{ marginBottom: 16 }} />
          <Table rowKey="workOrderId" dataSource={fillResult.results} pagination={{ pageSize: 10 }} columns={[
            { title: '工单编号', dataIndex: 'requestNo' },
            { title: '结果', dataIndex: 'status', render: (status) => <Tag color={status === 'updated' ? 'success' : status === 'failed' ? 'error' : 'default'}>{status === 'updated' ? '已填充' : status === 'failed' ? '失败' : '已跳过'}</Tag> },
            { title: '填充字段', dataIndex: 'fields', render: (fields?: string[]) => (fields || []).map((field) => CUSTOMER_RULE_FIELD_LABELS[field] || field).join('、') || '—' },
            { title: '说明', dataIndex: 'message' },
          ]} />
        </>}
      </Modal>
    </>
  );

  if (embedded) return content;
  return (
    <PageContainer
      title="客户门户规则配置"
      subTitle="维护客户办理规则与通知邮箱"
      extra={<Button icon={<ArrowRightOutlined />} onClick={() => navigate('/customer-config?tab=customers')}>客户门户配置</Button>}
    >
      {content}
    </PageContainer>
  );
};

export default CustomerRules;
