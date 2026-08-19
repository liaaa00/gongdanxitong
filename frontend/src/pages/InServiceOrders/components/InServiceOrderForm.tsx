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
  getInServiceProcessOptions,
  getInServiceRequirementOptions,
  type InServiceBusinessType,
  type InServiceOrderKind,
  type InServiceProcessType,
} from '@/constants/inService';
import { getRenewalHistory, type InServiceOrderPayload, type RenewalHistoryResult } from '@/services/inServiceOrders';
import {
  getAllowedFundRatios,
  getContractSubjects,
  type ContractSubjectItem,
} from '@/services/contractSubjects';
import { getOutOfProvinceAccounts, type OutOfProvinceAccount } from '@/services/outOfProvinceAccounts';

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
const thirdCol = { xs: 24, lg: 8 };
const dateValueProps = (value?: string) => ({ value: value ? dayjs(value) : null });
const normalizeDate = (value: Dayjs | null) => value?.format('YYYY-MM-DD');
const normalizeMonth = (value: Dayjs | null) => value?.format('YYYY-MM');
const YES_NO_OPTIONS = [
  { label: '是', value: '是' },
  { label: '否', value: '否' },
];

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
  'work_city',
  'work_hour_system',
  'salary_form',
  'base_salary',
  'other_salary',
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

const RENEWAL_REGIONAL_FIELD_GROUPS = new Set(['社保公积金信息', '社保公积金类']);

const RENEWAL_ALWAYS_REQUIRED = new Set([
  'contract_term_type',
  'contract_start_date',
  'base_salary',
]);

export const RENEWAL_SIGNING_METHOD = '续签';

export function getInServiceDepartmentNotice(orderKind: InServiceOrderKind): {
  message: string;
  description: string;
} | null {
  if (orderKind !== IN_SERVICE_ORDER_KINDS.CONTRACT_RENEWAL) return null;
  return {
    message: '续签发起部门',
    description: '系统有历史记录时自动继承部门；系统无历史记录时请选择存量员工所属部门。',
  };
}

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
  return false;
}

export function buildRenewalConfiguredFields(
  renewalFields: ImportTemplateFieldItem[],
  onboardingFields: ImportTemplateFieldItem[],
): ImportTemplateFieldItem[] {
  const renewalByCode = new Map(renewalFields.map((field) => [field.field_code, field]));
  const onboardingByCode = new Map(onboardingFields.map((field) => [field.field_code, field]));
  const configuredRegionalFields = onboardingFields.filter((field) => (
    field.is_included_in_template === false
    && RENEWAL_REGIONAL_FIELD_GROUPS.has(String(field.collection_group ?? '').trim())
  ));
  const selected = [
    ...RENEWAL_LEGACY_FIELD_CODES.map((code) => renewalByCode.get(code)),
    ...RENEWAL_CONTRACT_FIELD_CODES.map((code) => onboardingByCode.get(code)),
    ...configuredRegionalFields,
  ].filter((field): field is ImportTemplateFieldItem => Boolean(field));
  return Array.from(new Map(selected.map((field) => [field.field_code, field])).values())
    .map((field, index) => {
      const positionLocked = field.field_code === 'position' || field.field_code === 'position_type';
      return {
        ...field,
        is_required: !positionLocked && RENEWAL_ALWAYS_REQUIRED.has(field.field_code),
        default_required: !positionLocked && RENEWAL_ALWAYS_REQUIRED.has(field.field_code),
        display_order: index + 1,
      };
    });
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

function readExtraAlias(extraData: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = extraData[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return undefined;
}

function parsePayRegion(value: unknown): { province?: string; city?: string } {
  const parts = String(value ?? '')
    .split(/[\\/／|｜,，\\s-]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length < 2) return {};
  const province = parts[0].replace(/省$|市$|自治区$/g, '');
  return { province, city: parts[1] };
}

export function normalizeOutOfProvinceExtraData(
  extraData: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const source = { ...(extraData || {}) };
  const next = { ...source };
  const aliases: Record<string, string[]> = {
    insured_unit: ['contract_subject', 'contractSubject', 'insured_unit', 'insuredUnit', '参保单位', 'payment_institution', 'paymentInstitution'],
    social_pay_region: ['social_pay_region', 'socialPayRegion'],
    payment_institution: ['payment_institution', 'paymentInstitution'],
    start_month: ['start_month', 'startMonth'],
    fund_start_month: ['fund_start_month', 'fundStartMonth'],
    social_base: ['social_base', 'socialBase'],
    fund_base: ['fund_base', 'fundBase'],
    fund_ratio: ['fund_ratio', 'fundRatio'],
    social_insurance_result: ['social_insurance_result', 'socialInsuranceResult'],
    medical_insurance_result: ['medical_insurance_result', 'medicalInsuranceResult'],
    housing_fund_result: ['housing_fund_result', 'housingFundResult'],
    social_insurance_remark: ['social_insurance_remark', 'socialInsuranceRemark'],
    contract_start_date: ['contract_start_date', 'contractStartDate'],
    contract_end_date: ['contract_end_date', 'contractEndDate'],
    last_work_date: ['last_work_date', 'lastWorkDate'],
    social_stop_month: ['social_stop_month', 'socialStopMonth'],
    fund_stop_month: ['fund_stop_month', 'fundStopMonth'],
    resignation_reason: ['resignation_reason', 'resignationReason'],
  };
  for (const [target, keys] of Object.entries(aliases)) {
    const value = readExtraAlias(source, ...keys);
    if (value !== undefined) next[target] = value;
  }
  return next;
}

export function normalizeInServiceOrderFormValues(
  values: InServiceOrderFormValues,
  orderKind: InServiceOrderKind,
): InServiceOrderFormValues {
  if (orderKind === IN_SERVICE_ORDER_KINDS.OUT_OF_PROVINCE_INCREASE
    || orderKind === IN_SERVICE_ORDER_KINDS.OUT_OF_PROVINCE_DECREASE) {
    const extraData = normalizeOutOfProvinceExtraData(values.extraData);
    const region = parsePayRegion(extraData.social_pay_region);
    return {
      ...values,
      province: values.province || region.province as InServiceOrderFormValues['province'],
      city: values.city || region.city,
      extraData,
    };
  }
  if (orderKind !== IN_SERVICE_ORDER_KINDS.CONTRACT_RENEWAL) return values;
  return {
    ...values,
    extraData: normalizeRenewalExtraData(values.extraData),
  };
}

const IN_SERVICE_MUTABLE_FIELDS = [
  'customerId',
  'departmentId',
  'employeeName',
  'idCardNo',
  'extraData',
  'expectedCompletionDate',
  'businessReason',
  'businessType',
  'processType',
  'requirementType',
  'province',
  'city',
  'district',
  'businessDescription',
  'serviceFee',
  'attachments',
] as const;

export function buildInServiceMutableFields(
  values: InServiceOrderFormValues,
  orderKind: InServiceOrderKind,
): Partial<InServiceOrderPayload> {
  const normalized = normalizeInServiceOrderFormValues(values, orderKind);
  const changes: Partial<InServiceOrderPayload> = {};
  for (const field of IN_SERVICE_MUTABLE_FIELDS) {
    if (normalized[field] !== undefined) {
      Object.assign(changes, { [field]: normalized[field] });
    }
  }
  return changes;
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
  const [outOfProvinceAccounts, setOutOfProvinceAccounts] = useState<OutOfProvinceAccount[]>([]);
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [renewalConfiguredFields, setRenewalConfiguredFields] = useState<ImportTemplateFieldItem[]>([]);
  const [contractSubjects, setContractSubjects] = useState<ContractSubjectItem[]>([]);
  const [renewalHistory, setRenewalHistory] = useState<RenewalHistoryResult | null>(null);
  const [renewalHistoryLoading, setRenewalHistoryLoading] = useState(false);
  const effectiveKind = orderKind
    ?? initialValues?.orderKind
    ?? IN_SERVICE_ORDER_KINDS.SINGLE_BUSINESS;
  const businessType = Form.useWatch('businessType', form) as InServiceBusinessType | undefined;
  const processType = Form.useWatch('processType', form) as InServiceProcessType | undefined;
  const certificateType = Form.useWatch(['extraData', 'certificateType'], form) as string | undefined;
  const watchedExtraData = Form.useWatch('extraData', form) as Record<string, unknown> | undefined;
  const customerId = Form.useWatch('customerId', form) as string | undefined;
  const idCardNo = Form.useWatch('idCardNo', form) as string | undefined;

  useEffect(() => {
    Promise.all([
      getCustomers({ page: 1, pageSize: 100 }),
      effectiveKind === IN_SERVICE_ORDER_KINDS.CONTRACT_RENEWAL ? getDepartments() : Promise.resolve([]),
    ])
      .then(([customerResult, departmentResult]) => {
        setCustomers(customerResult.list.filter((item) => item.is_active !== false));
        setDepartments(departmentResult.filter((item) => item.is_active !== false));
      })
      .catch(() => message.warning('客户或部门选项加载失败，请稍后刷新'))
      .finally(() => setOptionsLoaded(true));
  }, [effectiveKind, message]);

  const customerOptions = useMemo(() => customers.map((item) => ({
    value: item.id,
    label: [item.customer_code, item.customer_name].filter(Boolean).join(' - '),
  })), [customers]);
  const departmentOptions = useMemo(() => {
    const flatten = (items: DepartmentItem[]): DepartmentItem[] => items.flatMap((item) => [
      ...(item.is_active !== false ? [item] : []),
      ...flatten(item.children ?? []),
    ]);
    return flatten(departments).map((item) => ({ value: item.id, label: item.name }));
  }, [departments]);
  const processOptions = getInServiceProcessOptions(businessType);
  const requirementOptions = getInServiceRequirementOptions(processType);
  const isSingleBusiness = effectiveKind === IN_SERVICE_ORDER_KINDS.SINGLE_BUSINESS;
  const isRenewal = effectiveKind === IN_SERVICE_ORDER_KINDS.CONTRACT_RENEWAL;
  const isCertificate = effectiveKind === IN_SERVICE_ORDER_KINDS.CERTIFICATE;
  const isResignationCertificate = effectiveKind === IN_SERVICE_ORDER_KINDS.RESIGNATION_CERTIFICATE;
  const isOutIncrease = effectiveKind === IN_SERVICE_ORDER_KINDS.OUT_OF_PROVINCE_INCREASE;
  const isOutDecrease = effectiveKind === IN_SERVICE_ORDER_KINDS.OUT_OF_PROVINCE_DECREASE;
  const isOutOfProvince = isOutIncrease || isOutDecrease;
  const departmentNotice = getInServiceDepartmentNotice(effectiveKind);

  useEffect(() => {
    if (!isOutOfProvince) {
      setOutOfProvinceAccounts([]);
      return;
    }
    getOutOfProvinceAccounts()
      .then(setOutOfProvinceAccounts)
      .catch(() => message.warning('省外账户目录加载失败，请稍后刷新'));
  }, [isOutOfProvince, message]);

  const insuredUnitValue = String(readExtraAlias(
    watchedExtraData || {},
    'contract_subject', 'contractSubject', 'insured_unit', 'insuredUnit', '参保单位',
    'payment_institution', 'paymentInstitution',
  ) ?? '');
  const insuredUnitOptions = useMemo(() => {
    const options = outOfProvinceAccounts.map((account) => ({
      value: account.unitName,
      label: `${account.unitName}（${account.province}/${account.city}）`,
    }));
    if (insuredUnitValue && !options.some((option) => option.value === insuredUnitValue)) {
      options.unshift({ value: insuredUnitValue, label: insuredUnitValue });
    }
    return options;
  }, [insuredUnitValue, outOfProvinceAccounts]);

  useEffect(() => {
    if (!isRenewal) {
      setRenewalConfiguredFields([]);
      return;
    }
    Promise.all([
      getCreateWorkOrderFields('renewal'),
      getCreateWorkOrderFields('onboarding'),
      getContractSubjects(),
    ])
      .then(([renewalFields, onboardingFields, subjects]) => {
        setRenewalConfiguredFields(buildRenewalConfiguredFields(renewalFields, onboardingFields));
        setContractSubjects(subjects);
      })
      .catch(() => {
        setRenewalConfiguredFields([]);
        message.warning('续签字段配置加载失败，请刷新后重试');
      });
  }, [isRenewal, message]);

  useEffect(() => {
    if (!isRenewal || !customerId || !idCardNo?.trim()) {
      setRenewalHistory(null);
      if (!readOnly) form.setFieldValue('departmentId', undefined);
      return;
    }
    setRenewalHistory(null);
    if (!readOnly) form.setFieldValue('departmentId', undefined);
    const timer = window.setTimeout(() => {
      setRenewalHistoryLoading(true);
      getRenewalHistory(customerId, idCardNo.trim())
        .then((result) => {
          setRenewalHistory(result);
          if (!result.found) return;
          const currentExtraData = form.getFieldValue('extraData') || {};
          const currentEmployeeName = form.getFieldValue('employeeName');
          form.setFieldsValue({
            employeeName: currentEmployeeName || result.employeeName || undefined,
            ...(result.departmentId ? { departmentId: result.departmentId } : {}),
            extraData: { ...result.extraData, ...currentExtraData },
          });
        })
        .catch(() => {
          setRenewalHistory(null);
          message.warning('员工历史数据查询失败，请检查客户和证件号');
        })
        .finally(() => setRenewalHistoryLoading(false));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [customerId, form, idCardNo, isRenewal, message]);

  useEffect(() => {
    if (!isCertificate || !customerId || !idCardNo?.trim()) return;
    const timer = window.setTimeout(() => {
      getRenewalHistory(customerId, idCardNo.trim())
        .then((result) => {
          if (!result.found) return;
          const source = result.extraData || {};
          const currentExtraData = form.getFieldValue('extraData') || {};
          const nextExtraData = {
            ...currentExtraData,
            hireDate: currentExtraData.hireDate ?? source.hire_date ?? source.contract_start_date,
            jobTitle: currentExtraData.jobTitle ?? source.job_title ?? source.position,
            referenceBaseSalary: currentExtraData.referenceBaseSalary
              ?? source.reference_base_salary
              ?? source.base_salary,
          };
          form.setFieldsValue({
            employeeName: form.getFieldValue('employeeName') || result.employeeName || undefined,
            extraData: nextExtraData,
          });
        })
        .catch(() => {
          // 历史资料仅用于默认值，查询失败不阻断证明开具。
        });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [customerId, form, idCardNo, isCertificate]);

  const selectedRenewalContractSubject = contractSubjects.find(
    (subject) => subject.subjectName === watchedExtraData?.contract_subject,
  );

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
    const positionLocked = field.field_code === 'position' || field.field_code === 'position_type';
    const addressLocked = field.field_code === 'company_address' && Boolean(watchedExtraData?.contract_subject);
    const commonProps = {
      name,
      label: field.field_name,
      rules: renewalFieldRules(field),
      required: !positionLocked && isRenewalFieldRequired(field, watchedExtraData),
      tooltip: field.help_text || undefined,
    };
    if (field.field_code === 'contract_subject' && contractSubjects.length > 0) {
      return (
        <Form.Item {...commonProps}>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="请选择劳动合同主体"
            options={contractSubjects.map((subject) => ({
              value: subject.subjectName,
              label: `${subject.subjectName}（${subject.city}）`,
            }))}
            onChange={(value) => {
              const selected = contractSubjects.find((subject) => subject.subjectName === value);
              form.setFieldsValue({
                extraData: {
                  ...(form.getFieldValue('extraData') || {}),
                  contract_subject: value,
                  company_address: selected?.registeredAddress || undefined,
                  fund_ratio: undefined,
                  supplementary_fund_ratio: undefined,
                },
              });
            }}
          />
        </Form.Item>
      );
    }
    if (field.field_code === 'fund_ratio') {
      const options = getAllowedFundRatios(selectedRenewalContractSubject);
      return (
        <Form.Item
          {...commonProps}
          required={options.length > 0}
          rules={options.length > 0 ? [{ required: true, message: '该主体的公积金比例为必填项' }, ...commonProps.rules] : commonProps.rules}
        >
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            disabled={options.length === 0}
            placeholder={options.length > 0 ? '请选择公积金比例' : '该主体暂无正式公积金比例'}
            options={options.map((value) => ({
              value,
              label: selectedRenewalContractSubject?.fundRatioMode === 'separate'
                ? `单位${value.split('+')[0]} + 个人${value.split('+')[1]}`
                : value,
            }))}
          />
        </Form.Item>
      );
    }
    if (field.field_code === 'supplementary_fund_ratio') {
      const options = selectedRenewalContractSubject?.supplementaryFundRatioOptions ?? [];
      if (options.length === 0) return null;
      return (
        <Form.Item {...commonProps}>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="请选择补充公积金比例"
            options={options.map((value) => ({ value, label: value }))}
          />
        </Form.Item>
      );
    }
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
        <Input
          maxLength={500}
          disabled={positionLocked || addressLocked}
          placeholder={field.placeholder || `请输入${field.field_name}`}
        />
      </Form.Item>
    );
  };

  const syncProvinceCity = (value: string) => {
    const parsed = parsePayRegion(value);
    if (parsed.province || parsed.city) {
      form.setFieldsValue({
        province: parsed.province || form.getFieldValue('province'),
        city: parsed.city || form.getFieldValue('city'),
      });
    }
  };

  const selectOutOfProvinceAccount = (unitName: string) => {
    const account = outOfProvinceAccounts.find((item) => item.unitName === unitName);
    if (!account) return;
    form.setFieldsValue({
      province: account.province as InServiceOrderFormValues['province'],
      city: account.city,
      extraData: {
        ...(form.getFieldValue('extraData') || {}),
        insured_unit: account.unitName,
        social_pay_region: `${account.province}/${account.city}`,
      },
    });
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
        ...(isOutOfProvince ? { extraData: normalizeOutOfProvinceExtraData(initialValues?.extraData) } : {}),
      }}
      disabled={readOnly}
      requiredMark
    >
      <Form.Item name="orderKind" hidden><Input /></Form.Item>
      {optionsLoaded && customerOptions.length === 0 ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="客户选项暂不可用"
          description="请确认当前账号具备客户基础数据读取权限后刷新页面。"
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
        {isRenewal ? (
          <Col {...formCol}>
            <Form.Item
              name="departmentId"
              label="发起部门"
              rules={[{ required: true, message: '请选择发起部门' }]}
              extra={renewalHistory?.found ? '已按客户和身份证号自动继承历史发起部门' : '系统无历史记录时必须明确选择存量员工所属部门'}
            >
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="请选择发起部门"
                options={departmentOptions}
                disabled={Boolean(renewalHistory?.found) || readOnly}
              />
            </Form.Item>
          </Col>
        ) : null}
        {departmentNotice ? (
          <Col {...formCol}>
            <Alert
              type="info"
              showIcon
              message={departmentNotice.message}
              description={departmentNotice.description}
            />
          </Col>
        ) : null}
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
          {renewalHistoryLoading ? <Alert type="info" showIcon message="正在查询员工历史数据" style={{ marginBottom: 16 }} /> : null}
          {renewalHistory?.warning ? <Alert type="warning" showIcon message="无固定期限合同风险提示" description={renewalHistory.warning} style={{ marginBottom: 16 }} /> : null}
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
              <>
                <Col {...formCol}>
                  <Form.Item name={['extraData', 'referenceBaseSalary']} label="基本工资参考">
                    <InputNumber precision={2} prefix="¥" style={{ width: '100%' }} disabled />
                  </Form.Item>
                </Col>
                <Col {...formCol}>
                  <Form.Item name={['extraData', 'averageMonthlyIncome']} label="近一年税前月均收入" extra="由经办人在办理完成时确认">
                    <InputNumber min={0} precision={2} prefix="¥" style={{ width: '100%' }} disabled />
                  </Form.Item>
                </Col>
              </>
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

      {isOutIncrease ? (
        <>
          <Divider orientation="left">社保公积金</Divider>
          <Row gutter={16}>
            <Col {...thirdCol}>
              <Form.Item
                name={['extraData', 'insured_unit']}
                label="参保单位"
                rules={[{ required: true, message: '请选择参保单位' }]}
              >
                <Select
                  showSearch
                  allowClear
                  optionFilterProp="label"
                  options={insuredUnitOptions}
                  onChange={selectOutOfProvinceAccount}
                  placeholder="请选择参保单位"
                />
              </Form.Item>
            </Col>
            <Col {...thirdCol}>
              <Form.Item
                name={['extraData', 'social_pay_region']}
                label="缴纳地"
                rules={[{ required: true, message: '请输入缴纳地' }]}
              >
                <Input
                  maxLength={200}
                  placeholder="例如：广东/深圳"
                  onChange={(event) => syncProvinceCity(event.currentTarget.value)}
                />
              </Form.Item>
            </Col>
            <Col {...thirdCol}>
              <Form.Item name={['extraData', 'social_insurance_remark']} label="社保公积金办理备注">
                <Input.TextArea rows={2} maxLength={2000} />
              </Form.Item>
            </Col>
            <Col {...thirdCol}>
              <Form.Item name={['extraData', 'start_month']} label="社保起缴月" rules={[{ required: true, message: '请选择社保起缴月' }]} getValueProps={dateValueProps} normalize={normalizeMonth}>
                <DatePicker picker="month" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col {...thirdCol}>
              <Form.Item name={['extraData', 'social_base']} label="社保缴费工资" rules={[{ required: true, message: '请输入社保缴费工资' }]}>
                <InputNumber min={0} precision={2} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col {...thirdCol}>
              <Form.Item name={['extraData', 'fund_start_month']} label="公积金起缴月" rules={[{ required: true, message: '请选择公积金起缴月' }]} getValueProps={dateValueProps} normalize={normalizeMonth}>
                <DatePicker picker="month" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col {...thirdCol}>
              <Form.Item name={['extraData', 'fund_base']} label="公积金缴费工资" rules={[{ required: true, message: '请输入公积金缴费工资' }]}>
                <InputNumber min={0} precision={2} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col {...thirdCol}>
              <Form.Item name={['extraData', 'fund_ratio']} label="公积金比例">
                <Input placeholder="按现有配置填写，例如：单位12%+个人12%" />
              </Form.Item>
            </Col>
            <Col {...thirdCol}>
              <Form.Item name={['extraData', 'social_insurance_result']} label="社保是否办结">
                <Select allowClear options={YES_NO_OPTIONS} />
              </Form.Item>
            </Col>
            <Col {...thirdCol}>
              <Form.Item name={['extraData', 'medical_insurance_result']} label="医保是否办结">
                <Select allowClear options={YES_NO_OPTIONS} />
              </Form.Item>
            </Col>
            <Col {...thirdCol}>
              <Form.Item name={['extraData', 'housing_fund_result']} label="公积金是否办结">
                <Select allowClear options={YES_NO_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="province" hidden><Input /></Form.Item>
          <Form.Item name="city" hidden><Input /></Form.Item>
        </>
      ) : null}
      {isOutDecrease ? (
        <>
          <Divider orientation="left">社保公积金</Divider>
          <Row gutter={16}>
            <Col {...thirdCol}>
              <Form.Item name={['extraData', 'social_insurance_result']} label="社保是否办结">
                <Select allowClear options={YES_NO_OPTIONS} />
              </Form.Item>
            </Col>
            <Col {...thirdCol}>
              <Form.Item name={['extraData', 'medical_insurance_result']} label="医保是否办结">
                <Select allowClear options={YES_NO_OPTIONS} />
              </Form.Item>
            </Col>
            <Col {...thirdCol}>
              <Form.Item name={['extraData', 'housing_fund_result']} label="公积金是否办结">
                <Select allowClear options={YES_NO_OPTIONS} />
              </Form.Item>
            </Col>
            <Col {...thirdCol}>
              <Form.Item
                name={['extraData', 'social_pay_region']}
                label="缴纳地"
                rules={[{ required: true, message: '请输入缴纳地' }]}
              >
                <Input maxLength={200} placeholder="例如：广东/深圳" onChange={(event) => syncProvinceCity(event.currentTarget.value)} />
              </Form.Item>
            </Col>
            <Col {...thirdCol}>
              <Form.Item name={['extraData', 'social_insurance_remark']} label="社保公积金办理备注">
                <Input.TextArea rows={2} maxLength={2000} />
              </Form.Item>
            </Col>
          </Row>
          <Divider orientation="left">其他字段</Divider>
          <Row gutter={16}>
            <Col {...thirdCol}>
              <Form.Item
                name={['extraData', 'insured_unit']}
                label="参保单位"
                rules={[{ required: true, message: '请选择参保单位' }]}
              >
                <Select
                  showSearch
                  allowClear
                  optionFilterProp="label"
                  options={insuredUnitOptions}
                  onChange={selectOutOfProvinceAccount}
                  placeholder="请选择参保单位"
                />
              </Form.Item>
            </Col>
            <Col {...thirdCol}>
              <Form.Item name={['extraData', 'social_insurance_remark']} label="社保公积金办理备注">
                <Input.TextArea rows={2} maxLength={2000} />
              </Form.Item>
            </Col>
            <Col {...thirdCol}>
              <Form.Item name={['extraData', 'social_stop_month']} label="社保停缴月" rules={[{ required: true, message: '请选择社保停缴月' }]} getValueProps={dateValueProps} normalize={normalizeMonth}>
                <DatePicker picker="month" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col {...thirdCol}>
              <Form.Item name={['extraData', 'fund_stop_month']} label="公积金停缴月" rules={[{ required: true, message: '请选择公积金停缴月' }]} getValueProps={dateValueProps} normalize={normalizeMonth}>
                <DatePicker picker="month" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col {...thirdCol}>
              <Form.Item name={['extraData', 'last_work_date']} label="最后工作日" rules={[{ required: true, message: '请选择最后工作日' }]} getValueProps={dateValueProps} normalize={normalizeDate}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="province" hidden><Input /></Form.Item>
          <Form.Item name="city" hidden><Input /></Form.Item>
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
