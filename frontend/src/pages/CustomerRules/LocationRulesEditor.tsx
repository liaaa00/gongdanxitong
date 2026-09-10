import { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Form, Input, Row, Select, Space, type FormInstance } from 'antd';
import { DeleteOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { getCustomerRuleBranches, type SaveCustomerRuleInput } from '@/services/customerRules';
import type { BranchItem } from '@/services/branches';
import { getContractSubjects, getFundLocations, type ContractSubjectItem } from '@/services/contractSubjects';

interface Props { customerId: string; form: FormInstance<SaveCustomerRuleInput> }

export default function LocationRulesEditor({ customerId, form }: Props) {
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [subjects, setSubjects] = useState<ContractSubjectItem[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setBranches([]);
    void Promise.all([getCustomerRuleBranches(customerId), getContractSubjects(undefined, true), getFundLocations(true)])
      .then(([nextBranches, nextSubjects, nextLocations]) => {
        if (!active) return;
        setBranches(nextBranches);
        setSubjects(nextSubjects.filter((subject) => subject.isActive));
        setLocations(nextLocations);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : '缴纳地、合同主体或商社列表加载失败');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [customerId, reload]);

  const branchOptions = branches.map((branch) => ({ value: branch.id, label: `${branch.branch_code} · ${branch.branch_name}` }));
  const subjectOptions = subjects.map((subject) => ({ value: subject.subjectName, label: subject.subjectName }));

  return <Space direction="vertical" size={16} style={{ width: '100%' }}>
    <Alert type="info" showIcon message="按缴纳地选择客户商社和差异规则" description="每个缴纳地配置一条规则；留空的覆盖项沿用客户通用规则。商社只能选择当前客户的有效商社，城市规则通过此页面维护。" />
    {error && <Alert type="error" showIcon message={error} action={<Button icon={<ReloadOutlined />} onClick={() => setReload((value) => value + 1)}>重试</Button>} />}
    {!loading && !error && branches.length === 0 && <Alert type="warning" showIcon message="当前客户没有可用商社，请先在客户资料中维护商社。" />}
    <Form.List name="paymentLocationRules" rules={[{ validator: async (_, rules: unknown[]) => {
      if (rules?.length > 100) throw new Error('每个客户最多配置100条缴纳地规则');
    } }]}>
      {(fields, { add, remove }, { errors }) => <>
        {fields.map((field) => <Card key={field.key} size="small" title={`缴纳地规则 ${field.name + 1}`} style={{ marginBottom: 12 }}
          extra={<Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(field.name)}>删除规则</Button>}>
          <Row gutter={16}>
            <Col xs={24} md={12}><Form.Item name={[field.name, 'socialLocation']} label="缴纳地" rules={[
              { required: true, message: '请选择缴纳地' },
              { validator: async (_, value: string) => {
                const rules = form.getFieldValue('paymentLocationRules') || [];
                if (value && rules.some((rule: { socialLocation?: string }, index: number) => index !== field.name && rule?.socialLocation?.trim() === value.trim())) throw new Error('同一缴纳地只能配置一条规则');
              } },
            ]}><Select showSearch optionFilterProp="label" loading={loading} options={locations.map((location) => ({ value: location, label: location }))} placeholder="选择缴纳城市" /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name={[field.name, 'branchId']} label="客户商社" rules={[
              { required: true, message: '请选择客户商社' },
              { validator: async (_, value: string) => {
                if (value && !loading && !error && !branches.some((branch) => branch.id === value)) throw new Error('所选商社已失效或不属于当前客户，请重新选择');
              } },
            ]}><Select showSearch optionFilterProp="label" loading={loading} options={branchOptions} placeholder="按商社编码或名称选择" /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name={[field.name, 'onboardingDefaults', 'contract_subject']} label="合同主体覆盖"><Select allowClear showSearch optionFilterProp="label" loading={loading} options={subjectOptions} placeholder="沿用通用合同主体" onChange={(value) => form.setFieldValue(['paymentLocationRules', field.name, 'onboardingDefaults', 'company_address'], subjects.find((subject) => subject.subjectName === value)?.registeredAddress || '')} /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name={[field.name, 'onboardingDefaults', 'company_address']} label="主体注册地覆盖"><Input readOnly placeholder="选择合同主体后带出" /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name={[field.name, 'onboardingDefaults', 'employee_type']} label="员工类型覆盖"><Input placeholder="留空沿用通用员工类型" /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name={[field.name, 'onboardingDefaults', 'business_mode']} label="业务模式覆盖"><Input /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name={[field.name, 'onboardingDefaults', 'outsource_type']} label="外包类型覆盖"><Input /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name={[field.name, 'onboardingDefaults', 'payroll_location']} label="发薪地覆盖"><Input /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name={[field.name, 'onboardingDefaults', 'need_esign']} label="需要电子签覆盖"><Select allowClear options={[{ label: '是', value: true }, { label: '否', value: false }]} /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name={[field.name, 'onboardingDefaults', 'esign_platform']} label="电子签平台覆盖"><Select allowClear options={['速创', 'E签宝'].map((value) => ({ label: value, value }))} /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name={[field.name, 'resignationDefaults', 'need_resignation_cert']} label="开具离职证明覆盖"><Select allowClear options={['是', '否'].map((value) => ({ label: value, value }))} /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name={[field.name, 'resignationDefaults', 'cert_delivery_method']} label="离职证明形式覆盖"><Select allowClear options={['电子版', '纸质版', '电子版和纸质版'].map((value) => ({ label: value, value }))} /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name={[field.name, 'resignationDefaults', 'cert_delivery_address']} label="离职证明送达地址覆盖"><Input /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name={[field.name, 'resignationDefaults', 'certificate_template']} label="离职证明模板覆盖"><Input /></Form.Item></Col>
          </Row>
        </Card>)}
        <Button type="dashed" icon={<PlusOutlined />} disabled={fields.length >= 100 || loading || !!error || branches.length === 0} onClick={() => add({ socialLocation: '', branchId: '', onboardingDefaults: {}, resignationDefaults: {} })}>新增缴纳地规则</Button>
        <Form.ErrorList errors={errors} />
      </>}
    </Form.List>
  </Space>;
}
