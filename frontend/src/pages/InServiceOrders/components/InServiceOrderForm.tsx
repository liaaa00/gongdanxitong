import { useEffect, useMemo, useState } from 'react';
import type { FormInstance } from 'antd';
import {
  Alert,
  App,
  Button,
  Col,
  DatePicker,
  Divider,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Upload,
} from 'antd';
import type { UploadFile, UploadProps } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { PaperClipOutlined, UploadOutlined } from '@ant-design/icons';
import { getCustomers, type CustomerItem } from '@/services/customers';
import { getDepartments, type DepartmentItem } from '@/services/departments';
import { uploadAttachment } from '@/services/upload';
import { getCreateWorkOrderFields, type ImportTemplateFieldItem } from '@/services/importTemplates';
import {
  IN_SERVICE_BUSINESS_TYPE_OPTIONS,
  IN_SERVICE_ORDER_KINDS,
  IN_SERVICE_PROVINCES,
  PROVINCES_27,
  getInServiceProcessOptions,
  getInServiceRequirementOptions,
  type InServiceBusinessType,
  type InServiceOrderKind,
  type InServiceProcessType,
} from '@/constants/inService';
import type { InServiceOrderPayload } from '@/services/inServiceOrders';

export type InServiceOrderFormValues = InServiceOrderPayload;

interface InServiceOrderFormProps {
  form: FormInstance<InServiceOrderFormValues>;
  orderKind?: InServiceOrderKind;
  initialValues?: Partial<InServiceOrderFormValues>;
  readOnly?: boolean;
}

interface AttachmentFieldProps {
  value?: string[];
  onChange?: (value: string[]) => void;
  disabled?: boolean;
}

const formCol = { xs: 24, lg: 12 };
const dateValueProps = (value?: string) => ({ value: value ? dayjs(value) : null });
const normalizeDate = (value: Dayjs | null) => value?.format('YYYY-MM-DD');

const RENEWAL_LEGACY_FIELD_CODES = [
  'renewal_reason',
  'prev_contract_no',
  'prev_contract_end_date',
  'need_renewal_urge',
  'renewal_remark',
] as const;

const RENEWAL_CONTRACT_FIELD_CODES = [
  'id_card_type',
  'mobile',
  'email',
  'position',
  'position_type',
  'gender',
  'contract_term_type',
  'contract_term',
  'contract_start_date',
  'contract_end_date',
  'probation_start_date',
  'probation_months',
  'probation_end_date',
  'work_city',
  'work_hour_system',
  'salary_form',
  'base_salary',
  'other_salary',
  'probation_salary',
  'probation_other_salary',
  'payroll_cycle',
  'payroll_date',
  'current_address',
  'household_address',
  'postal_code',
  'need_esign',
  'esign_platform',
  'contract_subject',
  'company_address',
  'project_name',
  'work_arrangement',
  'contract_template',
] as const;

const RENEWAL_ALWAYS_REQUIRED = new Set([
  'id_card_type',
  'mobile',
  'position',
  'position_type',
  'contract_term_type',
  'contract_start_date',
  'work_city',
  'work_hour_system',
  'salary_form',
  'base_salary',
  'payroll_cycle',
  'payroll_date',
  'current_address',
  'household_address',
  'need_esign',
  'contract_subject',
  'project_name',
  'work_arrangement',
  'contract_template',
]);

export const RENEWAL_SIGNING_METHOD = '续签';

export function isRenewalFieldRequired(
  field: ImportTemplateFieldItem,
  extraData: Record<string, unknown> = {},
): boolean {
  const code = field.field_code;
  if (field.is_required) return true;
  if (code === 'contract_term' || code === 'contract_end_date') {
    return String(extraData.contract_term_type || '') !== '无固定期限';
  }
  if (code === 'esign_platform') return extraData.need_esign === '1.是';
  if (code === 'company_address') return extraData.esign_platform === 'E签宝';
  if (['probation_months', 'probation_end_date', 'probation_salary'].includes(code)) {
    return Boolean(extraData.probation_start_date);
  }
  return false;
}

export function buildRenewalConfiguredFields(
  renewalFields: ImportTemplateFieldItem[],
  onboardingFields: ImportTemplateFieldItem[],
): ImportTemplateFieldItem[] {
  const renewalByCode = new Map(renewalFields.map((field) => [field.field_code, field]));
  const onboardingByCode = new Map(onboardingFields.map((field) => [field.field_code, field]));
  return [
    ...RENEWAL_LEGACY_FIELD_CODES.map((code) => renewalByCode.get(code)),
    ...RENEWAL_CONTRACT_FIELD_CODES.map((code) => onboardingByCode.get(code)),
  ]
    .filter((field): field is ImportTemplateFieldItem => Boolean(field))
    .map((field, index) => ({
      ...field,
      is_required: RENEWAL_ALWAYS_REQUIRED.has(field.field_code) || field.is_required,
      default_required: RENEWAL_ALWAYS_REQUIRED.has(field.field_code) || field.default_required,
      display_order: index + 1,
    }));
}

export function normalizeRenewalExtraData(
  extraData: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const data = { ...(extraData || {}) };
  const contractStartDate = data.contract_start_date ?? data.renewal_start_date ?? data.contractStartDate;
  const contractEndDate = data.contract_end_date ?? data.renewal_end_date ?? data.contractEndDate;
  const contractSubject = data.contract_subject ?? data.renewal_contract_subject ?? data.contractSubject;
  const contractTemplate = data.contract_template ?? data.renewal_contract_template ?? data.contractTemplate;
  const contractTermType = data.contract_term_type ?? data.renewal_term_type;
  const contractTerm = data.contract_term ?? data.renewal_term;
  const workCity = data.work_city ?? data.renewal_work_city;
  const position = data.position ?? data.renewal_position;
  const baseSalary = data.base_salary ?? data.renewal_base_salary;
  const otherSalary = data.other_salary ?? data.renewal_other_salary;
  const probationMonths = data.probation_months ?? data.renewal_probation_months;

  return {
    ...data,
    contractSigningMethod: 'renewal',
    contract_signing_method: RENEWAL_SIGNING_METHOD,
    contractStartDate,
    contractEndDate,
    contractSubject,
    contractTemplate,
    renewal_start_date: contractStartDate,
    renewal_end_date: contractEndDate,
    renewal_contract_subject: contractSubject,
    renewal_contract_template: contractTemplate,
    renewal_term_type: contractTermType,
    renewal_term: contractTerm,
    renewal_work_city: workCity,
    renewal_position: position,
    renewal_base_salary: baseSalary,
    renewal_other_salary: otherSalary,
    renewal_probation_months: probationMonths,
  };
}

export function normalizeInServiceOrderFormValues(
  values: InServiceOrderFormValues,
  orderKind: InServiceOrderKind,
): InServiceOrderFormValues {
  if (orderKind !== IN_SERVICE_ORDER_KINDS.CONTRACT_RENEWAL) return values;
  return {
    ...values,
    extraData: normalizeRenewalExtraData(values.extraData),
  };
}

export function AttachmentField({ value = [], onChange, disabled }: AttachmentFieldProps) {
  const { message } = App.useApp();
  const [uploading, setUploading] = useState(false);
  const fileList: UploadFile[] = value.map((id, index) => ({
    uid: id,
    name: '附件' + (index + 1),
    status: 'done',
    response: { id },
  }));

  const customRequest: UploadProps['customRequest'] = async ({
    file,
    onError,
    onSuccess,
  }) => {
    if (value.length >= 5) {
      message.warning('每张工单最多上传 5 个附件');
      onError?.(new Error('attachment limit'));
      return;
    }
    setUploading(true);
    try {
      const result = await uploadAttachment(file as File);
      const id = String(result.id || '');
      if (!id) throw new Error('附件上传未返回文件标识');
      onChange?.([...value, id]);
      onSuccess?.({ id });
      message.success('附件上传成功');
    } catch (error) {
      onError?.(error as Error);
      message.error(error instanceof Error ? error.message : '附件上传失败');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Upload
      fileList={fileList}
      customRequest={customRequest}
      disabled={disabled}
      maxCount={5}
      multiple
      onRemove={(file) => {
        onChange?.(value.filter((id) => id !== file.uid));
        return true;
      }}
      showUploadList={{ showRemoveIcon: !disabled, showDownloadIcon: false }}
    >
      {!disabled && value.length < 5 ? (
        <Button icon={<UploadOutlined />} loading={uploading}>上传附件</Button>
      ) : null}
    </Upload>
  );
}

export default function InServiceOrderForm({
  form,
  orderKind,
  initialValues,
  readOnly = false,
}: InServiceOrderFormProps) {
  const { message } = App.useApp();
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [renewalConfiguredFields, setRenewalConfiguredFields] = useState<ImportTemplateFieldItem[]>([]);
  const effectiveKind = orderKind
    ?? initialValues?.orderKind
    ?? IN_SERVICE_ORDER_KINDS.SINGLE_BUSINESS;
  const businessType = Form.useWatch('businessType', form) as InServiceBusinessType | undefined;
  const processType = Form.useWatch('processType', form) as InServiceProcessType | undefined;
  const certificateType = Form.useWatch(['extraData', 'certificateType'], form) as string | undefined;
  const watchedExtraData = Form.useWatch('extraData', form) as Record<string, unknown> | undefined;

  useEffect(() => {
    Promise.all([getCustomers({ page: 1, pageSize: 100 }), getDepartments()])
      .then(([customerResult, departmentResult]) => {
        setCustomers(customerResult.list.filter((item) => item.is_active !== false));
        setDepartments(departmentResult.filter((item) => item.is_active !== false));
      })
      .catch(() => message.warning('客户或部门选项加载失败，请稍后刷新'))
      .finally(() => setOptionsLoaded(true));
  }, [message]);

  const customerOptions = useMemo(() => customers.map((item) => ({
    value: item.id,
    label: [item.customer_code, item.customer_name].filter(Boolean).join(' - '),
  })), [customers]);
  const departmentOptions = useMemo(() => departments.map((item) => ({
    value: item.id,
    label: item.name,
  })), [departments]);
  const processOptions = getInServiceProcessOptions(businessType);
  const requirementOptions = getInServiceRequirementOptions(processType);
  const isSingleBusiness = effectiveKind === IN_SERVICE_ORDER_KINDS.SINGLE_BUSINESS;
  const isRenewal = effectiveKind === IN_SERVICE_ORDER_KINDS.CONTRACT_RENEWAL;
  const isCertificate = effectiveKind === IN_SERVICE_ORDER_KINDS.CERTIFICATE;
  const isResignationCertificate = effectiveKind === IN_SERVICE_ORDER_KINDS.RESIGNATION_CERTIFICATE;
  const isOutIncrease = effectiveKind === IN_SERVICE_ORDER_KINDS.OUT_OF_PROVINCE_INCREASE;
  const isOutDecrease = effectiveKind === IN_SERVICE_ORDER_KINDS.OUT_OF_PROVINCE_DECREASE;
  const isOutOfProvince = isOutIncrease || isOutDecrease;

  useEffect(() => {
    if (!isRenewal) {
      setRenewalConfiguredFields([]);
      return;
    }
    Promise.all([
      getCreateWorkOrderFields('renewal'),
      getCreateWorkOrderFields('onboarding'),
    ])
      .then(([renewalFields, onboardingFields]) => {
        setRenewalConfiguredFields(buildRenewalConfiguredFields(renewalFields, onboardingFields));
      })
      .catch(() => {
        setRenewalConfiguredFields([]);
        message.warning('续签字段配置加载失败，请刷新后重试');
      });
  }, [isRenewal, message]);

  const renewalFieldRules = (field: ImportTemplateFieldItem) => {
    const rules: Array<Record<string, unknown>> = [];
    if (isRenewalFieldRequired(field, watchedExtraData)) {
      rules.push({ required: true, message: `请输入${field.field_name}` });
    }
    if (field.validation_regex) {
      rules.push({
        pattern: new RegExp(field.validation_regex),
        message: field.validation_msg || `${field.field_name}格式不正确`,
      });
    }
    return rules;
  };

  const renderRenewalConfiguredField = (field: ImportTemplateFieldItem) => {
    const name = ['extraData', field.field_code];
    const commonProps = {
      name,
      label: field.field_name,
      rules: renewalFieldRules(field),
      required: isRenewalFieldRequired(field, watchedExtraData),
      tooltip: field.help_text || undefined,
    };
    if (field.field_type === 'date') {
      return (
        <Form.Item {...commonProps} getValueProps={dateValueProps} normalize={normalizeDate}>
          <DatePicker style={{ width: '100%' }} placeholder={field.placeholder || `请选择${field.field_name}`} />
        </Form.Item>
      );
    }
    if (field.field_type === 'number') {
      return (
        <Form.Item {...commonProps}>
          <InputNumber precision={2} style={{ width: '100%' }} placeholder={field.placeholder || `请输入${field.field_name}`} />
        </Form.Item>
      );
    }
    if (field.field_type === 'dropdown') {
      return (
        <Form.Item {...commonProps}>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={field.placeholder || `请选择${field.field_name}`}
            options={field.dropdown_options || []}
          />
        </Form.Item>
      );
    }
    if (field.field_type === 'textarea') {
      return (
        <Form.Item {...commonProps}>
          <Input.TextArea rows={3} maxLength={5000} placeholder={field.placeholder || `请输入${field.field_name}`} />
        </Form.Item>
      );
    }
    return (
      <Form.Item {...commonProps}>
        <Input maxLength={500} placeholder={field.placeholder || `请输入${field.field_name}`} />
      </Form.Item>
    );
  };

  return (
    <Form<InServiceOrderFormValues>
      form={form}
      layout="vertical"
      initialValues={{
        attachments: [],
        orderKind: effectiveKind,
        ...initialValues,
        ...(isRenewal ? { extraData: normalizeRenewalExtraData(initialValues?.extraData) } : {}),
      }}
      disabled={readOnly}
      requiredMark
    >
      <Form.Item name="orderKind" hidden><Input /></Form.Item>
      {optionsLoaded && (customerOptions.length === 0 || departmentOptions.length === 0) ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="客户或部门选项暂不可用"
          description="请确认当前账号具备客户、部门基础数据读取权限后刷新页面。"
        />
      ) : null}

      <Divider orientation="left">工单信息</Divider>
      <Row gutter={16}>
        <Col {...formCol}>
          <Form.Item name="customerId" label="客户全称" rules={[{ required: true, message: '请选择客户' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="请选择客户"
              options={customerOptions}
              onChange={(customerId) => {
                const customer = customers.find((item) => item.id === customerId);
                if (!customer) return;
                form.setFieldsValue({
                  extraData: {
                    ...(form.getFieldValue('extraData') || {}),
                    customer_code: customer.customer_code,
                    customer_name: customer.customer_name,
                  },
                });
              }}
            />
          </Form.Item>
        </Col>
        <Col {...formCol}>
          <Form.Item name="departmentId" label="发起部门" rules={[{ required: true, message: '请选择发起部门' }]}>
            <Select showSearch optionFilterProp="label" placeholder="请选择发起部门" options={departmentOptions} />
          </Form.Item>
        </Col>
        {(isSingleBusiness || isOutOfProvince) ? (
          <Col {...formCol}>
            <Form.Item
              name="expectedCompletionDate"
              label="期望完成日期"
              rules={isSingleBusiness ? [{ required: true, message: '请选择期望完成日期' }] : undefined}
              getValueProps={dateValueProps}
              normalize={normalizeDate}
            >
              <DatePicker style={{ width: '100%' }} placeholder="请选择期望完成日期" />
            </Form.Item>
          </Col>
        ) : null}
        {isSingleBusiness ? (
          <Col {...formCol}>
            <Form.Item name="businessReason" label="办理事由" rules={[{ required: true, message: '请输入办理事由' }, { max: 512 }]}>
              <Input placeholder="简要说明本次办理原因" maxLength={512} />
            </Form.Item>
          </Col>
        ) : null}
      </Row>

      {!isSingleBusiness ? (
        <>
          <Divider orientation="left">员工信息</Divider>
          <Row gutter={16}>
            <Col {...formCol}>
              <Form.Item name="employeeName" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
                <Input maxLength={128} />
              </Form.Item>
            </Col>
            <Col {...formCol}>
              <Form.Item name="idCardNo" label="证件号" rules={[{ required: true, message: '请输入证件号' }]}>
                <Input maxLength={64} />
              </Form.Item>
            </Col>
          </Row>
        </>
      ) : null}

      {isSingleBusiness ? (
        <>
          <Divider orientation="left">业务分类</Divider>
          <Row gutter={16}>
            <Col {...formCol}>
              <Form.Item name="businessType" label="一级分类" rules={[{ required: true, message: '请选择一级分类' }]}>
                <Select
                  placeholder="请选择一级分类"
                  options={IN_SERVICE_BUSINESS_TYPE_OPTIONS}
                  onChange={() => form.setFieldsValue({ processType: undefined, requirementType: undefined })}
                />
              </Form.Item>
            </Col>
            <Col {...formCol}>
              <Form.Item name="processType" label="二级分类" rules={[{ required: true, message: '请选择二级分类' }]}>
                <Select
                  placeholder="请先选择一级分类"
                  disabled={readOnly || !businessType}
                  options={processOptions}
                  onChange={() => form.setFieldsValue({ requirementType: undefined })}
                />
              </Form.Item>
            </Col>
            <Col {...formCol}>
              <Form.Item name="requirementType" label="三级分类" rules={[{ required: requirementOptions.length > 0, message: '请选择三级分类' }]}>
                <Select
                  allowClear
                  placeholder={requirementOptions.length > 0 ? '请选择三级分类' : '当前二级分类无三级项'}
                  disabled={readOnly || requirementOptions.length === 0}
                  options={requirementOptions}
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">办理地与费用</Divider>
          <Row gutter={16}>
            <Col {...formCol}>
              <Form.Item name="province" label="省份" rules={[{ required: true, message: '请选择省份' }]}>
                <Select showSearch optionFilterProp="label" options={IN_SERVICE_PROVINCES.map((value) => ({ value, label: value }))} />
              </Form.Item>
            </Col>
            <Col {...formCol}>
              <Form.Item name="city" label="城市" rules={[{ required: true, message: '请输入城市' }]}>
                <Input maxLength={50} />
              </Form.Item>
            </Col>
            <Col {...formCol}>
              <Form.Item name="district" label="地区" rules={[{ required: true, message: '请输入地区' }]}>
                <Input maxLength={50} />
              </Form.Item>
            </Col>
            <Col {...formCol}>
              <Form.Item name="serviceFee" label="客户支付服务费" rules={[{ required: true, message: '请输入服务费' }]}>
                <InputNumber min={0} precision={2} prefix="¥" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </>
      ) : null}

      {isRenewal ? (
        <>
          <Divider orientation="left">续签合同信息</Divider>
          <Row gutter={16}>
            <Col {...formCol}>
              <Form.Item label="合同签订方式">
                <Input value={RENEWAL_SIGNING_METHOD} disabled />
              </Form.Item>
            </Col>
          </Row>
          {renewalConfiguredFields.length === 0 ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message="续签字段配置暂不可用"
              description="请刷新页面重试，字段加载成功后才能提交续签工单。"
            />
          ) : (
            <Row gutter={16}>
              {renewalConfiguredFields.map((field) => (
                <Col {...formCol} key={field.field_code}>
                  {renderRenewalConfiguredField(field)}
                </Col>
              ))}
            </Row>
          )}
        </>
      ) : null}

      {isCertificate ? (
        <>
          <Divider orientation="left">证明内容</Divider>
          <Row gutter={16}>
            <Col {...formCol}>
              <Form.Item name={['extraData', 'certificateType']} label="证明类型" rules={[{ required: true, message: '请选择证明类型' }]}>
                <Select options={[
                  { label: '在职证明', value: 'employment' },
                  { label: '收入证明', value: 'income' },
                  { label: '社保证明（模板待配置）', value: 'social_insurance', disabled: true },
                ]} />
              </Form.Item>
            </Col>
            <Col {...formCol}>
              <Form.Item name={['extraData', 'hireDate']} label="入职日期" rules={[{ required: true }]} getValueProps={dateValueProps} normalize={normalizeDate}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col {...formCol}>
              <Form.Item name={['extraData', 'jobTitle']} label="职务" rules={[{ required: true, message: '请输入职务' }]}>
                <Input maxLength={128} />
              </Form.Item>
            </Col>
            <Col {...formCol}>
              <Form.Item name={['extraData', 'purpose']} label="证明用途" rules={[{ required: true, message: '请输入证明用途' }]}>
                <Input maxLength={256} />
              </Form.Item>
            </Col>
            {certificateType === 'income' ? (
              <Col {...formCol}>
                <Form.Item name={['extraData', 'averageMonthlyIncome']} label="近一年税前月均收入" rules={[{ required: true, message: '请输入月均收入' }]}>
                  <InputNumber min={0} precision={2} prefix="¥" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            ) : null}
          </Row>
        </>
      ) : null}

      {isResignationCertificate ? (
        <>
          <Divider orientation="left">离职证明信息</Divider>
          <Row gutter={16}>
            <Col {...formCol}>
              <Form.Item name={['extraData', 'resignationDate']} label="离职日期" rules={[{ required: true }]} getValueProps={dateValueProps} normalize={normalizeDate}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col {...formCol}>
              <Form.Item name={['extraData', 'resignationReason']} label="离职原因">
                <Input maxLength={512} />
              </Form.Item>
            </Col>
            <Col {...formCol}>
              <Form.Item name={['extraData', 'deliveryAddress']} label="送达地址">
                <Input maxLength={512} />
              </Form.Item>
            </Col>
          </Row>
        </>
      ) : null}

      {isOutOfProvince ? (
        <>
          <Divider orientation="left">省外参保信息</Divider>
          <Row gutter={16}>
            <Col {...formCol}>
              <Form.Item name="province" label="参保省份" rules={[{ required: true, message: '请选择参保省份' }]}>
                <Select showSearch optionFilterProp="label" options={PROVINCES_27.map((value) => ({ value, label: value }))} />
              </Form.Item>
            </Col>
            <Col {...formCol}>
              <Form.Item name="city" label="参保城市" rules={[{ required: true, message: '请输入参保城市' }]}>
                <Input maxLength={50} />
              </Form.Item>
            </Col>
            <Col {...formCol}>
              <Form.Item name={['extraData', 'paymentInstitution']} label="缴纳机构" rules={[{ required: true, message: '请输入缴纳机构' }]}>
                <Input maxLength={200} />
              </Form.Item>
            </Col>
            {isOutIncrease ? (
              <>
                <Col {...formCol}>
                  <Form.Item name={['extraData', 'contractStartDate']} label="合同开始时间" rules={[{ required: true }]} getValueProps={dateValueProps} normalize={normalizeDate}>
                    <DatePicker style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col {...formCol}>
                  <Form.Item name={['extraData', 'contractEndDate']} label="合同结束时间" rules={[{ required: true }]} getValueProps={dateValueProps} normalize={normalizeDate}>
                    <DatePicker style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </>
            ) : null}
            {isOutDecrease ? (
              <Col {...formCol}>
                <Form.Item name={['extraData', 'lastWorkDate']} label="最后工作日" rules={[{ required: true }]} getValueProps={dateValueProps} normalize={normalizeDate}>
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            ) : null}
            <Col {...formCol}><Form.Item name={['extraData', 'ethnicity']} label="民族"><Input maxLength={50} /></Form.Item></Col>
            <Col {...formCol}><Form.Item name={['extraData', 'education']} label="学历"><Input maxLength={50} /></Form.Item></Col>
            <Col {...formCol}><Form.Item name={['extraData', 'householdType']} label="户籍类型"><Input maxLength={50} /></Form.Item></Col>
            <Col {...formCol}><Form.Item name={['extraData', 'householdAddress']} label="户籍地"><Input maxLength={256} /></Form.Item></Col>
          </Row>
        </>
      ) : null}

      <Divider orientation="left">材料与补充信息</Divider>
      <Row gutter={16}>
        <Col span={24}>
          <Form.Item name="attachments" label="附件" extra={readOnly ? undefined : '最多上传 5 个附件'}>
            <AttachmentField disabled={readOnly} />
          </Form.Item>
        </Col>
        {isSingleBusiness ? (
          <Col span={24}>
            <Form.Item name="businessDescription" label="订单内容" rules={[{ required: true, message: '请详细描述订单内容' }, { max: 5000 }]}>
              <Input.TextArea rows={5} maxLength={5000} showCount={!readOnly} />
            </Form.Item>
          </Col>
        ) : (
          <Col span={24}>
            <Form.Item name={['extraData', 'remark']} label="补充备注">
              <Input.TextArea rows={4} maxLength={2000} showCount={!readOnly} />
            </Form.Item>
          </Col>
        )}
      </Row>

      {readOnly && (initialValues?.attachments?.length || 0) > 0 ? (
        <Space size={4}><PaperClipOutlined />共 {initialValues?.attachments?.length} 个附件</Space>
      ) : null}
    </Form>
  );
}
