import type { FieldConfigItem } from '@/services/fields';

type ReviewField = Pick<FieldConfigItem, 'field_code' | 'field_type' | 'dropdown_options'>;

function yesNoChoice(value: string): boolean | undefined {
  const match = value.trim().match(/^(?:[12][.、．\s]*)?(是|否)$/);
  return match ? match[1] === '是' : undefined;
}

/** 只转换已有布尔值的显示格式，不补默认值，也不改写人工选择或来源数据。 */
export function normalizePortalIntakeValues(
  values: Record<string, unknown>,
  fields: ReviewField[],
): Record<string, unknown> {
  const normalized = { ...values };
  for (const field of fields) {
    const value = values[field.field_code];
    if (field.field_type !== 'dropdown' || typeof value !== 'boolean') continue;
    const option = field.dropdown_options?.find((item) => (
      yesNoChoice(item.label) ?? yesNoChoice(item.value)
    ) === value);
    if (option) normalized[field.field_code] = option.value;
  }
  return normalized;
}
