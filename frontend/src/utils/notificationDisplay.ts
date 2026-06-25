import type { NotificationItem } from '@/services/notifications';

const GENERIC_OPERATOR_NAMES = new Set(['办理人', '处理人', '操作人', '负责人', '用户', '当前用户', 'current user', 'operator', 'handler']);

const FIELD_LABEL_FALLBACKS: Record<string, string> = {
  customer_name: '客户名称',
  customer_code: '客户代码',
  employee_name: '员工姓名',
  employee_id_card: '证件号',
  id_card_no: '身份证号码（护照）',
  mobile: '移动电话',
  email: '电子邮件',
  bank_name: '开户银行信息',
  bank_account: '银行借记卡帐号',
  order_no: '工单编号',
  module_code: '模块',
  module_name: '模块名称',
  handler_name: '办理人',
  contract_subject: '劳动合同主体',
  contract_template: '劳动合同模板',
  contract_urge: '劳动合同签署催办',
  contract_feedback: '劳动合同新签反馈',
  onboarding_feedback: '入职联系反馈',
  data_entry_feedback: '增员报岗录入反馈',
  social_insurance_feedback: '社保公积金增员反馈',
  special_remark: '特殊备注',
  return_reason: '退回原因',
  status: '状态',
};

const ENTITY_LABEL_FALLBACKS: Record<string, string> = {
  work_order: '工单',
  workOrder: '工单',
  order: '工单',
  dispatched_order: '子工单',
  dispatchedOrder: '子工单',
  sub_order: '子工单',
  onboarding_contact: '入职联系',
  contract: '劳动合同新签',
  data_entry: '增员报岗录入',
  social_insurance: '社保公积金增员',
  renewal_contract: '劳动合同续签',
  resignation_contact: '离职材料收集',
  data_entry_resign: '减员报岗录入',
  resignation_social_insurance: '社保公积金减员',
  social_insurance_resign: '社保公积金减员',
  resignation_cert: '离职材料收集',
  contract_feedback: '劳动合同新签反馈',
};

const ACTION_LABEL_FALLBACKS: Record<string, string> = {
  update: '修改了',
  updated: '修改了',
  modify: '修改了',
  modified: '修改了',
  change: '修改了',
  changed: '修改了',
  supplement: '补充了',
  supplemented: '补充了',
  fill: '填写了',
  filled: '填写了',
  return: '退回了',
  returned: '退回了',
};

const INTERNAL_KEY_PATTERN = /\b[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]*\b/g;
const WHOLE_INTERNAL_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]*$/;

type NotificationNameSource = Partial<NotificationItem> & Record<string, unknown>;
type NotificationChange = { field?: string; fieldLabel?: string; oldValue?: unknown; newValue?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
}

function normalizeDisplayName(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  if (GENERIC_OPERATOR_NAMES.has(text.toLowerCase()) || GENERIC_OPERATOR_NAMES.has(text)) return undefined;
  return text;
}

function readNestedDisplayName(source: unknown): string | undefined {
  if (!source) return undefined;
  if (typeof source === 'string') return normalizeDisplayName(source);
  if (typeof source !== 'object') return undefined;
  const record = source as Record<string, unknown>;
  return normalizeDisplayName(record.realName)
    || normalizeDisplayName(record.real_name)
    || normalizeDisplayName(record.name)
    || normalizeDisplayName(record.userName)
    || normalizeDisplayName(record.user_name)
    || normalizeDisplayName(record.nickname);
}

export function getNotificationOperatorName(item: Partial<NotificationItem> | NotificationNameSource): string | undefined {
  const source = item as NotificationNameSource;
  const directKeys = [
    'actorName', 'actor_name', 'operatorName', 'operator_name', 'userName', 'user_name',
    'realName', 'real_name', 'creatorName', 'creator_name', 'changedByName', 'changed_by_name',
    'handlerName', 'handler_name', 'updatedByName', 'updated_by_name', 'createdByName', 'created_by_name',
  ];
  for (const key of directKeys) {
    const name = normalizeDisplayName(source[key]);
    if (name) return name;
  }
  for (const key of ['actor', 'operator', 'user', 'creator', 'changedBy', 'changed_by']) {
    const name = readNestedDisplayName(source[key]);
    if (name) return name;
  }
  for (const bagKey of ['payload', 'metadata', 'extra', 'context', 'context_fields', 'contextFields']) {
    const bag = source[bagKey];
    if (!isRecord(bag)) continue;
    const name = getNotificationOperatorName(bag as NotificationNameSource);
    if (name) return name;
  }
  return undefined;
}

function normalizeLabelCandidate(value: unknown, fallbackField?: unknown, genericLabel = '相关字段'): string | undefined {
  const raw = String(value ?? '').trim();
  if (!raw) return fallbackField === undefined ? undefined : getNotificationFieldLabel(fallbackField);
  const mapped = FIELD_LABEL_FALLBACKS[raw] || ENTITY_LABEL_FALLBACKS[raw];
  if (mapped) return mapped;
  if (WHOLE_INTERNAL_KEY_PATTERN.test(raw)) return genericLabel;
  return localizeNotificationInternalKeys(raw);
}

export function getNotificationFieldLabel(field?: unknown): string | undefined {
  const raw = String(field ?? '').trim();
  if (!raw) return undefined;
  return FIELD_LABEL_FALLBACKS[raw] || (WHOLE_INTERNAL_KEY_PATTERN.test(raw) ? '相关字段' : raw);
}

function getEntityLabel(entity?: unknown): string | undefined {
  const raw = String(entity ?? '').trim();
  if (!raw) return undefined;
  return ENTITY_LABEL_FALLBACKS[raw] || FIELD_LABEL_FALLBACKS[raw] || (WHOLE_INTERNAL_KEY_PATTERN.test(raw) ? '相关对象' : raw);
}

function getActionLabel(action?: unknown): string {
  const raw = String(action ?? '').trim();
  if (!raw) return '修改了';
  return ACTION_LABEL_FALLBACKS[raw] || ACTION_LABEL_FALLBACKS[raw.toLowerCase()] || (WHOLE_INTERNAL_KEY_PATTERN.test(raw) ? '更新了' : raw);
}

function formatNotificationValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '空';
  if (typeof value === 'object') {
    try { return localizeNotificationInternalKeys(JSON.stringify(value)); } catch { return String(value); }
  }
  return localizeNotificationInternalKeys(String(value));
}

function normalizeNotificationChange(raw: unknown): NotificationChange | undefined {
  if (!isRecord(raw)) return undefined;
  const field = firstDefined(raw.field, raw.field_code, raw.fieldCode, raw.key, raw.name, raw.code);
  const explicitLabel = firstDefined(raw.fieldLabel, raw.field_label, raw.fieldName, raw.field_name, raw.label);
  const fieldLabel = normalizeLabelCandidate(explicitLabel, field);
  if (!field && !fieldLabel) return undefined;
  return {
    field: field ? String(field) : undefined,
    fieldLabel,
    oldValue: firstDefined(raw.oldValue, raw.old_value, raw.before, raw.from, raw.previousValue, raw.previous_value, raw.old),
    newValue: firstDefined(raw.newValue, raw.new_value, raw.after, raw.to, raw.currentValue, raw.current_value, raw.new),
  };
}

function normalizeDiffEntry(field: string, value: unknown): NotificationChange | undefined {
  if (Array.isArray(value)) {
    return {
      field,
      fieldLabel: getNotificationFieldLabel(field),
      oldValue: value[0],
      newValue: value[1],
    };
  }
  if (isRecord(value)) {
    return normalizeNotificationChange({ field, ...value });
  }
  return {
    field,
    fieldLabel: getNotificationFieldLabel(field),
    newValue: value,
  };
}

function collectNotificationPayloads(item: Partial<NotificationItem> | NotificationNameSource): Record<string, unknown>[] {
  const source = item as NotificationNameSource;
  const payloads: Record<string, unknown>[] = [source];
  for (const key of ['payload', 'metadata', 'extra', 'context', 'context_fields', 'contextFields']) {
    const value = source[key];
    if (isRecord(value)) payloads.push(value);
  }
  return payloads;
}

function collectChangesFromValue(value: unknown): NotificationChange[] {
  const changes: NotificationChange[] = [];
  if (Array.isArray(value)) {
    value.forEach((entry) => {
      const change = normalizeNotificationChange(entry);
      if (change) changes.push(change);
    });
    return changes;
  }
  if (isRecord(value)) {
    for (const [field, diffValue] of Object.entries(value)) {
      const change = normalizeDiffEntry(field, diffValue);
      if (change) changes.push(change);
    }
  }
  return changes;
}

function getPayloadChanges(payloads: Record<string, unknown>[]): NotificationChange[] {
  const changes: NotificationChange[] = [];
  for (const payload of payloads) {
    for (const key of ['diff_summary_fields', 'changes', 'diffs', 'diff', 'diff_fields', 'diffFields']) {
      changes.push(...collectChangesFromValue(payload[key]));
    }
    const singleChange = normalizeNotificationChange(payload);
    if (singleChange) changes.push(singleChange);
  }
  const seen = new Set<string>();
  return changes.filter((change) => {
    const fingerprint = `${change.field || change.fieldLabel}|${formatNotificationValue(change.oldValue)}|${formatNotificationValue(change.newValue)}`;
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

function getPayloadValue(payloads: Record<string, unknown>[], ...keys: string[]): unknown {
  for (const payload of payloads) {
    const value = firstDefined(...keys.map((key) => payload[key]));
    if (value !== undefined) return value;
  }
  return undefined;
}

export function localizeNotificationInternalKeys(text: string): string {
  return text.replace(INTERNAL_KEY_PATTERN, (token) => FIELD_LABEL_FALLBACKS[token] || ENTITY_LABEL_FALLBACKS[token] || '相关字段');
}

function buildNotificationContentFromSummary(payloads: Record<string, unknown>[], actorName?: string): string | undefined {
  const rawSummary = getPayloadValue(payloads, 'diff_summary', 'diffSummary');
  if (rawSummary === undefined) return undefined;
  const summary = localizeNotificationInternalKeys(String(rawSummary).trim());
  if (!summary) return undefined;
  if (!actorName || summary.includes(actorName)) return summary;
  const actionLabel = getActionLabel(getPayloadValue(payloads, 'action', 'actionType', 'action_type'));
  const entityLabel = getEntityLabel(getPayloadValue(payloads, 'entityName', 'entity_name', 'entity', 'entity_type'));
  const entityText = entityLabel ? `【${entityLabel}】` : '';
  return `${actorName} ${actionLabel}${entityText}：${summary}`;
}

function buildNotificationContentFromPayload(item: Partial<NotificationItem> | NotificationNameSource, actorName?: string): string | undefined {
  const payloads = collectNotificationPayloads(item);
  const summaryContent = buildNotificationContentFromSummary(payloads, actorName);
  if (summaryContent) return summaryContent;

  const changes = getPayloadChanges(payloads);
  const entityLabel = getEntityLabel(getPayloadValue(payloads, 'entityName', 'entity_name', 'entity', 'entity_type'));
  const actionLabel = getActionLabel(getPayloadValue(payloads, 'action', 'actionType', 'action_type'));
  if (changes.length === 0) return undefined;
  const actorPrefix = actorName ? `${actorName} ` : '';
  const entityText = entityLabel ? `【${entityLabel}】` : '';
  const detailText = changes.map((change) => {
    const label = change.fieldLabel || getNotificationFieldLabel(change.field) || '相关字段';
    const oldValue = formatNotificationValue(change.oldValue);
    const newValue = formatNotificationValue(change.newValue);
    if (change.oldValue !== undefined || change.newValue !== undefined) return `【${label}】由【${oldValue}】改为【${newValue}】`;
    return `【${label}】`;
  }).join('；');
  return `${actorPrefix}${actionLabel}${entityText}：${detailText}`;
}

export function getNotificationDisplayContent(item: Partial<NotificationItem> | NotificationNameSource): string {
  const content = String(item.content || '').trim();
  const actorName = getNotificationOperatorName(item);
  const payloadContent = buildNotificationContentFromPayload(item, actorName);
  if (payloadContent) return payloadContent;

  const localizedContent = localizeNotificationInternalKeys(content);
  if (!actorName) {
    return localizedContent.replace(/^(办理人|处理人|操作人)([:：\s]+)?/, '').trim() || '系统通知';
  }
  const contentWithActor = localizedContent.replace(/办理人|处理人|操作人/g, actorName).trim();
  if (contentWithActor.includes(actorName)) return contentWithActor;
  return `操作人：${actorName}；${contentWithActor || '请查看详情'}`;
}

export function getNotificationDisplayTitle(item: Partial<NotificationItem> | NotificationNameSource): string {
  const title = String(item.title || '').trim();
  return title ? localizeNotificationInternalKeys(title) : '通知详情';
}
