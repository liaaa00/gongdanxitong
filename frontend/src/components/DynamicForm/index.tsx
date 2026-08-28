import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ProForm,
  ProFormText,
  ProFormDigit,
  ProFormDatePicker,
  ProFormSelect,
  ProFormTextArea,
} from '@ant-design/pro-components';
import type { ProFormInstance } from '@ant-design/pro-components';
import { App, Card, Col, Row } from 'antd';
import type { Dayjs } from 'dayjs';
import {
  findFundRuleForLocation,
  getAllowedFundRatios,
  getContractSubjects,
  getFundLocations,
  getFundRulesByLocation,
  type ContractSubjectItem,
} from '@/services/contractSubjects';

export interface FieldConfig {
  field_code: string;
  field_name: string;
  field_type: 'text' | 'number' | 'date' | 'dropdown' | 'textarea';
  is_required: boolean;
  default_required: boolean;
  validation_regex?: string | null;
  validation_msg?: string | null;
  dropdown_options?: { label: string; value: string }[] | null;
  placeholder?: string | null;
  help_text?: string | null;
  order_type?: string | null;
  /** ★ 采集分组（用于表单内分组展示） */
  collection_group?: string | null;
  /** ★ 来源分类 */
  source_category?: 'customer_filled' | 'agent_supplemented' | 'process_judgment' | null;
  /** ★ 后端业务域归属：字段可跨业务复用 */
  business_context?: string[] | null;
  is_included_in_template?: boolean;
  display_order: number;
  is_active?: boolean;
}

export interface ConditionalCondition {
  field: string;
  operator?: 'equals' | 'exists' | 'notEquals';
  value?: string | string[];
}

export interface ConditionalRequired extends Partial<ConditionalCondition> {
  conditions?: ConditionalCondition[];
  requireFields: string[];
}

export type FieldPermission = 'visible' | 'hidden' | 'readonly' | 'masked';

interface DynamicFormProps {
  fields: FieldConfig[];
  fieldPermissions?: Record<string, FieldPermission>;
  conditionalRequired?: ConditionalRequired[];
  orderType?: string;
  initialValues?: Record<string, unknown>;
  formRef?: React.MutableRefObject<ProFormInstance | undefined> | React.RefObject<ProFormInstance | undefined>;
  readOnly?: boolean;
  onFinish?: (values: Record<string, unknown>) => Promise<void>;
  onValuesChange?: (changedValues: Record<string, unknown>, allValues: Record<string, unknown>) => void;
  submitText?: string;
  hideSubmit?: boolean;
  validateChangedFieldsOnly?: boolean;
  loading?: boolean;
  highlightedFields?: string[];
  focusField?: string | null;
}

function hasConditionalValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function matchesConditionalRule(
  condition: ConditionalRequired | ConditionalCondition,
  values: Record<string, unknown>,
): boolean {
  if ('conditions' in condition && condition.conditions?.length) {
    return condition.conditions.every((child) => matchesConditionalRule(child, values));
  }

  if (!condition.field) return false;
  const triggerValue = values[condition.field];
  if (condition.operator === 'exists') return hasConditionalValue(triggerValue);
  if (condition.operator === 'notEquals') {
    const expectedValues = Array.isArray(condition.value) ? condition.value : [condition.value];
    return !expectedValues.filter((value): value is string => typeof value === 'string').includes(String(triggerValue ?? ''));
  }
  const expectedValues = Array.isArray(condition.value) ? condition.value : [condition.value];
  return expectedValues.filter((value): value is string => typeof value === 'string').includes(String(triggerValue ?? ''));
}

function conditionReferencesField(condition: ConditionalRequired, fieldCode: string): boolean {
  return condition.field === fieldCode
    || Boolean(condition.conditions?.some((child) => child.field === fieldCode));
}

function describeConditionalRule(
  condition: ConditionalRequired,
  fieldNameMap: Record<string, string>,
): string {
  if (condition.conditions?.length) {
    return condition.conditions
      .map((child) => {
        const name = fieldNameMap[child.field] || child.field;
        if (child.operator === 'exists') return `「${name}」有值`;
        const expectedValues = Array.isArray(child.value) ? child.value : [child.value];
        const operator = child.operator === 'notEquals' ? '不为' : '为';
        return `「${name}」${operator}${expectedValues.filter(Boolean).join('/')}`;
      })
      .join('且');
  }
  const name = fieldNameMap[condition.field || ''] || condition.field || '指定字段';
  if (condition.operator === 'exists') return `「${name}」有值`;
  const expectedValues = Array.isArray(condition.value) ? condition.value : [condition.value];
  const operator = condition.operator === 'notEquals' ? '不为' : '为';
  return `「${name}」${operator}${expectedValues.filter(Boolean).join('/')}`;
}

function getPermission(
  fieldCode: string,
  fieldPermissions?: Record<string, FieldPermission>,
  readOnly?: boolean,
): FieldPermission {
  if (readOnly) return 'readonly';
  return fieldPermissions?.[fieldCode] ?? 'visible';
}

const ONBOARDING_VISIBLE_GROUPS = [
  '基本信息',
  '合同与用工信息',
  '薪资与发薪信息',
  '社保公积金信息',
  '业务判断项',
  '备注与反馈',
  // 兼容历史分组名，避免旧数据迁移前字段被隐藏
  '劳动合同新签',
  '劳动合同签订',
  '入职联系',
  '发薪信息',
  '社保公积金类',
];
const DEFAULT_COLLECTION_GROUP = '其他信息';

function DynamicForm({
  fields,
  fieldPermissions,
  conditionalRequired,
  orderType,
  initialValues,
  formRef,
  readOnly,
  onFinish,
  onValuesChange,
  submitText,
  hideSubmit,
  validateChangedFieldsOnly,
  loading,
  highlightedFields,
  focusField,
}: DynamicFormProps) {
  const { message } = App.useApp();
  const [currentValues, setCurrentValues] = useState<Record<string, unknown>>(initialValues ?? {});
  const changedFieldCodesRef = useRef(new Set<string>());
  const internalFormRef = useRef<ProFormInstance>();
  const effectiveFormRef = formRef ?? internalFormRef;
  const [contractSubjects, setContractSubjects] = useState<ContractSubjectItem[]>([]);
  const [fundLocations, setFundLocations] = useState<string[]>([]);
  const [fundRules, setFundRules] = useState<ContractSubjectItem[]>([]);
  const hasContractSubjectFields = fields.some((field) => ['contract_subject', 'company_address'].includes(field.field_code));
  const hasPaymentLocationFields = fields.some((field) => ['social_location', 'social_pay_region'].includes(field.field_code));
  const hasFundRatioFields = fields.some((field) => ['fund_ratio', 'supplementary_fund_ratio'].includes(field.field_code));
  const socialLocation = String(currentValues.social_location ?? currentValues.social_pay_region ?? '').trim();
  const previousSocialLocationRef = useRef(socialLocation);

  useEffect(() => {
    const previous = previousSocialLocationRef.current;
    if (previous !== socialLocation) {
      const cleared = { fund_ratio: undefined, supplementary_fund_ratio: undefined };
      effectiveFormRef.current?.setFieldsValue(cleared);
      setCurrentValues((values) => ({ ...values, ...cleared }));
    }
    previousSocialLocationRef.current = socialLocation;
  }, [effectiveFormRef, socialLocation]);

  useEffect(() => {
    if (!hasContractSubjectFields) {
      setContractSubjects((previous) => (previous.length === 0 ? previous : []));
      return;
    }
    getContractSubjects()
      .then(setContractSubjects)
      .catch(() => message.warning('劳动合同主体目录加载失败，可稍后刷新重试'));
  }, [hasContractSubjectFields, message]);

  useEffect(() => {
    if (!hasPaymentLocationFields) {
      setFundLocations((previous) => (previous.length === 0 ? previous : []));
      return;
    }
    getFundLocations()
      .then((locations) => setFundLocations(Array.from(new Set(locations)).sort()))
      .catch(() => message.warning('缴纳地城市目录加载失败，请稍后刷新'));
  }, [hasPaymentLocationFields, message]);

  useEffect(() => {
    if (!hasFundRatioFields || !socialLocation) {
      setFundRules((previous) => (previous.length === 0 ? previous : []));
      return;
    }
    let active = true;
    getFundRulesByLocation(socialLocation)
      .then((rules) => {
        if (active) setFundRules(rules);
      })
      .catch(() => {
        if (active) message.warning('参保地公积金规则加载失败，请稍后刷新');
      });
    return () => {
      active = false;
    };
  }, [hasFundRatioFields, message, socialLocation]);

  const fieldNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const f of fields) {
      map[f.field_code] = f.field_name;
    }
    return map;
  }, [fields]);

  const sortedFields = useMemo(() => {
    let filtered = [...fields];
    if (orderType) {
      const isAvailableForOrder = (f: FieldConfig) => (
        f.order_type === null ||
        f.order_type === undefined ||
        f.order_type === orderType ||
        Boolean(f.business_context?.includes(orderType))
      );
      const hasOtherOrderType = fields.some((f) => !isAvailableForOrder(f));
      // 后端 /admin/fields?orderType=xxx 已按 businessContext 返回当前业务可用字段。
      // 如果返回列表里混入其他业务字段，再做一次兜底过滤；跨业务公共字段通过 business_context 保留。
      if (hasOtherOrderType) {
        filtered = filtered.filter(isAvailableForOrder);
      }
    }
    if (orderType === 'onboarding') {
      filtered = filtered.filter((f) => {
        const group = f.collection_group?.trim();
        // 后端 hot fix 同步期间可能不返回 collection_group；前端容错为“未分组/其他”仍渲染，避免选客户后字段全被过滤掉。
        if (!group) return true;
        return ONBOARDING_VISIBLE_GROUPS.includes(group);
      });
    }

    return filtered.sort((a, b) => a.display_order - b.display_order);
  }, [fields, orderType]);

  const groupedFields = useMemo(() => {
    const groups = new Map<string, FieldConfig[]>();
    sortedFields.forEach((field) => {
      const groupName = field.collection_group?.trim() || DEFAULT_COLLECTION_GROUP;
      const current = groups.get(groupName) || [];
      current.push(field);
      groups.set(groupName, current);
    });
    const entries = Array.from(groups.entries());
    return [
      ...entries.filter(([groupName]) => groupName !== DEFAULT_COLLECTION_GROUP),
      ...entries.filter(([groupName]) => groupName === DEFAULT_COLLECTION_GROUP),
    ];
  }, [sortedFields]);

  const highlightedFieldSet = useMemo(() => new Set((highlightedFields || []).filter(Boolean)), [highlightedFields]);
  const normalizedFocusField = focusField && highlightedFieldSet.has(focusField) ? focusField : highlightedFields?.find(Boolean);

  useEffect(() => {
    if (!normalizedFocusField) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`dynamic-field-${normalizedFocusField}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [normalizedFocusField]);

  const getFieldConditions = (fieldCode: string) => (
    (conditionalRequired ?? []).filter((condition) => condition.requireFields.includes(fieldCode))
  );

  const isConditionallyRequired = (fieldCode: string) => (
    getFieldConditions(fieldCode).some((condition) => matchesConditionalRule(condition, currentValues))
  );

  const getConditionalRules = (fieldCode: string) => (
    getFieldConditions(fieldCode).map((condition) => ({
      validator: async (_: unknown, value: unknown) => {
        if (matchesConditionalRule(condition, currentValues) && !hasConditionalValue(value)) {
          throw new Error(`当${describeConditionalRule(condition, fieldNameMap)}时此项为必填`);
        }
      },
    }))
  );

  const buildValidationRules = (field: FieldConfig) => {
    const rules: Array<Record<string, unknown>> = [];
    const perm = getPermission(field.field_code, fieldPermissions, readOnly);
    const isReadonly = perm === 'readonly' || perm === 'masked';
    const fieldConditions = getFieldConditions(field.field_code);
    const shouldValidate = !validateChangedFieldsOnly
      || changedFieldCodesRef.current.has(field.field_code)
      || fieldConditions.some((condition) => Array.from(changedFieldCodesRef.current).some((code) => conditionReferencesField(condition, code)));

    if (!shouldValidate) return rules;

    if (field.is_required && !isReadonly) {
      rules.push({ required: true, message: `${field.field_name}为必填` });
    }

    if (!isReadonly) {
      const conditional = getConditionalRules(field.field_code);
      rules.push(...conditional);
    }

    if (field.validation_regex) {
      rules.push({
        pattern: new RegExp(field.validation_regex),
        message: field.validation_msg || `${field.field_name}格式不正确`,
      });
    }

    return rules;
  };

  const selectedFundRule = findFundRuleForLocation(fundRules, socialLocation);

  const renderField = (field: FieldConfig) => {
    const perm = getPermission(field.field_code, fieldPermissions, readOnly);
    if (perm === 'hidden') return null;

    const disabled = perm === 'readonly' || perm === 'masked';
    const commonProps = {
      name: field.field_code,
      label: field.field_name,
      required: field.is_required || isConditionallyRequired(field.field_code),
      placeholder: field.placeholder || `请输入${field.field_name}`,
      disabled,
      tooltip: field.help_text,
      rules: buildValidationRules(field),
      fieldProps: {
        'aria-label': field.field_name,
        'aria-describedby': field.help_text ? `${field.field_code}-help` : undefined,
      },
    };

    if (field.field_code === 'contract_subject' && contractSubjects.length > 0) {
      return (
        <ProFormSelect
          key={field.field_code}
          {...commonProps}
          fieldProps={{
            ...commonProps.fieldProps,
            showSearch: true,
            allowClear: true,
            optionFilterProp: 'label',
            getPopupContainer: (triggerNode: HTMLElement) => triggerNode.parentElement || document.body,
          }}
          options={contractSubjects.map((subject) => ({
            value: subject.subjectName,
            label: subject.city ? `${subject.subjectName}｜城市：${subject.city}` : subject.subjectName,
          }))}
          onChange={(value) => {
            const selected = contractSubjects.find((subject) => subject.subjectName === value);
            const address = selected?.registeredAddress || undefined;
            const changed = {
              contract_subject: value,
              company_address: address,
            };
            const nextValues = { ...currentValues, ...changed };
            effectiveFormRef.current?.setFieldsValue(changed);
            setCurrentValues(nextValues);
            onValuesChange?.(changed, nextValues);
          }}
        />
      );
    }

    if (field.field_code === 'company_address') {
      return (
        <ProFormText
          key={field.field_code}
          {...commonProps}
          disabled={disabled || Boolean(currentValues.contract_subject)}
        />
      );
    }

    if (field.field_code === 'social_location' || field.field_code === 'social_pay_region') {
      const currentLocation = String(currentValues[field.field_code] ?? '').trim();
      const locationOptions = [...fundLocations];
      if (currentLocation && !locationOptions.includes(currentLocation)) locationOptions.unshift(currentLocation);
      return (
        <ProFormSelect
          key={field.field_code}
          {...commonProps}
          options={locationOptions.map((value) => ({ value, label: value }))}
          fieldProps={{
            ...commonProps.fieldProps,
            showSearch: true,
            allowClear: true,
            optionFilterProp: 'label',
            getPopupContainer: (triggerNode: HTMLElement) => triggerNode.parentElement || document.body,
          }}
        />
      );
    }

    if (field.field_code === 'fund_ratio') {
      const options = getAllowedFundRatios(selectedFundRule);
      return (
        <ProFormSelect
          key={field.field_code}
          {...commonProps}
          required={options.length > 0}
          rules={options.length > 0 ? [{ required: true, message: '该主体的公积金比例为必填项' }, ...commonProps.rules] : commonProps.rules}
          disabled={disabled || options.length === 0}
          placeholder={options.length > 0 ? '请选择公积金比例' : '该主体暂无正式公积金比例'}
          fieldProps={{
            ...commonProps.fieldProps,
            showSearch: true,
            allowClear: true,
            optionFilterProp: 'label',
            getPopupContainer: (triggerNode: HTMLElement) => triggerNode.parentElement || document.body,
          }}
          options={options.map((value) => ({
            value,
            label: selectedFundRule?.fundRatioMode === 'separate'
              ? `单位${value.split('+')[0]} + 个人${value.split('+')[1]}`
              : value,
          }))}
        />
      );
    }

    if (field.field_code === 'supplementary_fund_ratio') {
      const options = selectedFundRule?.supplementaryFundRatioOptions ?? [];
      if (options.length === 0) return null;
      return (
        <ProFormSelect
          key={field.field_code}
          {...commonProps}
          fieldProps={{
            ...commonProps.fieldProps,
            showSearch: true,
            allowClear: true,
            optionFilterProp: 'label',
            getPopupContainer: (triggerNode: HTMLElement) => triggerNode.parentElement || document.body,
          }}
          options={options.map((value) => ({ value, label: value }))}
        />
      );
    }

    switch (field.field_type) {
      case 'number':
        return <ProFormDigit key={field.field_code} {...commonProps} fieldProps={{ ...commonProps.fieldProps, precision: 2 }} />;
      case 'date':
        return (
          <ProFormDatePicker
            key={field.field_code}
            {...commonProps}
            fieldProps={{
              ...commonProps.fieldProps,
              style: { width: '100%' },
              getPopupContainer: (triggerNode: HTMLElement) => triggerNode.parentElement || document.body,
            }}
          />
        );
      case 'dropdown':
        return (
          <ProFormSelect
            key={field.field_code}
            {...commonProps}
            fieldProps={{
              ...commonProps.fieldProps,
              showSearch: true,
              allowClear: true,
              optionFilterProp: 'label',
              getPopupContainer: (triggerNode: HTMLElement) => triggerNode.parentElement || document.body,
            }}
            options={field.dropdown_options || []}
          />
        );
      case 'textarea':
        return <ProFormTextArea key={field.field_code} {...commonProps} />;
      case 'text':
      default:
        return <ProFormText key={field.field_code} {...commonProps} />;
    }
  };

  const normalizeSubmitValues = (values: Record<string, unknown>): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    const dropdownFieldCodes = new Set(
      fields.filter((field) => field.field_type === 'dropdown').map((field) => field.field_code),
    );

    for (const key of Object.keys(values)) {
      const val = values[key];
      if (val && typeof val === 'object' && 'format' in (val as Record<string, unknown>)) {
        result[key] = (val as Dayjs).format('YYYY-MM-DD');
      } else if (dropdownFieldCodes.has(key) && Array.isArray(val)) {
        result[key] = val.length > 0 ? String(val[val.length - 1]) : undefined;
      } else {
        result[key] = val;
      }
    }
    return result;
  };

  const handleValuesChange = (changedValues: Record<string, unknown>, allValues: Record<string, unknown>) => {
    Object.keys(changedValues).forEach((fieldCode) => changedFieldCodesRef.current.add(fieldCode));
    setCurrentValues(allValues);
    onValuesChange?.(changedValues, allValues);
  };

  const handleFinish = async (values: Record<string, unknown>) => {
    if (!onFinish) return;
    try {
      const converted = normalizeSubmitValues(values);
      await onFinish(converted);
    } catch (err: unknown) {
      const error = err as Error;
      message.error(error?.message || '提交失败');
    }
  };

  return (
    <ProForm
      formRef={effectiveFormRef as React.RefObject<ProFormInstance>}
      initialValues={initialValues}
      onFinish={handleFinish}
      onValuesChange={handleValuesChange}
      submitter={
        onFinish && !hideSubmit
          ? {
              searchConfig: { submitText: submitText || '提交' },
              submitButtonProps: {
                htmlType: 'button',
                loading,
                onClick: () => effectiveFormRef.current?.submit(),
              },
            }
          : false
      }
      layout="vertical"
    >
      {groupedFields.map(([groupName, groupFields]) => (
        <Card key={groupName} title={groupName} size="small" style={{ marginBottom: 16 }}>
          <Row gutter={[16, 16]}>
            {groupFields.map((field) => {
              const node = renderField(field);
              if (!node) return null;
              const highlighted = highlightedFieldSet.has(field.field_code);
              return (
                <Col
                  id={`dynamic-field-${field.field_code}`}
                  key={field.field_code}
                  xs={24}
                  sm={24}
                  md={12}
                  lg={8}
                  xl={8}
                  style={highlighted ? { background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 8, padding: 8 } : undefined}
                >
                  {node}
                </Col>
              );
            })}
          </Row>
        </Card>
      ))}
    </ProForm>
  );
}

export default DynamicForm;
export type { DynamicFormProps };
