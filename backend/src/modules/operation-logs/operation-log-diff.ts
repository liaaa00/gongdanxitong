export interface OperationLogDiffItem {
  field: string;
  fieldLabel: string;
  before: unknown;
  after: unknown;
}

const IGNORED_FIELDS = new Set([
  'updatedAt',
  'updated_at',
  'lastModifiedAt',
  'last_modified_at',
  'lastModifiedBy',
  'last_modified_by',
]);

export function computeOperationLogDiffs(
  beforeData: Record<string, unknown> | null | undefined,
  afterData: Record<string, unknown> | null | undefined,
  fieldNameMap: Map<string, string>,
): OperationLogDiffItem[] {
  const before = beforeData ?? {};
  const after = afterData ?? {};
  const diffs: OperationLogDiffItem[] = [];
  appendDiffs(diffs, before, after, '', fieldNameMap);
  return diffs;
}

function appendDiffs(
  diffs: OperationLogDiffItem[],
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  prefix: string,
  fieldNameMap: Map<string, string>,
): void {
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  for (const key of keys) {
    if (IGNORED_FIELDS.has(key)) continue;
    const field = prefix ? `${prefix}.${key}` : key;
    const beforeValue = before[key];
    const afterValue = after[key];
    if (isPlainObject(beforeValue) && isPlainObject(afterValue)) {
      appendDiffs(diffs, beforeValue, afterValue, field, fieldNameMap);
      continue;
    }
    if (!sameValue(beforeValue, afterValue)) {
      diffs.push({
        field,
        fieldLabel: resolveFieldLabel(field, fieldNameMap),
        before: beforeValue ?? null,
        after: afterValue ?? null,
      });
    }
  }
}

function resolveFieldLabel(field: string, fieldNameMap: Map<string, string>): string {
  const direct = fieldNameMap.get(field);
  if (direct) return direct;
  const leaf = field.includes('.') ? field.slice(field.lastIndexOf('.') + 1) : field;
  return fieldNameMap.get(leaf) ?? field;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}
