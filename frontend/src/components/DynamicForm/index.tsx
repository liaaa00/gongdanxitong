import { useEffect, useMemo } from 'react';
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
  display_order: number;
  is_active?: boolean;
}

export interface ConditionalRequired {
  field: string;
  value: string | string[];
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
  loading?: boolean;
  highlightedFields?: string[];
  focusField?: string | null;
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
  loading,
  highlightedFields,
  focusField,
}: DynamicFormProps) {
  const { message } = App.useApp();

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

  const getConditionalRules = (fieldCode: string) => {
    if (!conditionalRequired) return [];
    return conditionalRequired
      .filter((cond) => cond.requireFields.includes(fieldCode))
      .map((cond) => ({
        validator: async (_: unknown, value: unknown) => {
          const triggerValue = formRef?.current?.getFieldValue?.(cond.field);
          const expectedValues = Array.isArray(cond.value) ? cond.value : [cond.value];
          const shouldRequire = expectedValues.includes(String(triggerValue ?? ''));
          const isEmpty = value === undefined || value === null || value === '';
          if (shouldRequire && isEmpty) {
            const condFieldName = fieldNameMap[cond.field] || cond.field;
            throw new Error(`当「${condFieldName}」为${expectedValues.join('/')}时此项为必填`);
          }
        },
      }));
  };

  const buildValidationRules = (field: FieldConfig) => {
    const rules: Array<Record<string, unknown>> = [];
    const perm = getPermission(field.field_code, fieldPermissions, readOnly);
    const isReadonly = perm === 'readonly' || perm === 'masked';

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

  const renderField = (field: FieldConfig) => {
    const perm = getPermission(field.field_code, fieldPermissions, readOnly);
    if (perm === 'hidden') return null;

    const disabled = perm === 'readonly' || perm === 'masked';
    const commonProps = {
      name: field.field_code,
      label: field.field_name,
      placeholder: field.placeholder || `请输入${field.field_name}`,
      disabled,
      tooltip: field.help_text,
      rules: buildValidationRules(field),
      fieldProps: {
        'aria-label': field.field_name,
        'aria-describedby': field.help_text ? `${field.field_code}-help` : undefined,
      },
    };

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
      formRef={formRef as React.RefObject<ProFormInstance>}
      initialValues={initialValues}
      onFinish={handleFinish}
      onValuesChange={onValuesChange}
      submitter={
        onFinish && !hideSubmit
          ? {
              searchConfig: { submitText: submitText || '提交' },
              submitButtonProps: { loading },
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
