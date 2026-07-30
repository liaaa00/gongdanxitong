import { DispatchedOrderStatus } from 'src/entities';
import { isSocialInsuranceDispatchModule } from 'src/common/constants/dispatch-modules';

export const HANDLING_RESULT_COMPLETED = '是';
export const HANDLING_RESULT_UNCOMPLETED = '否';
export const HANDLING_RESULT_OPTIONS = [HANDLING_RESULT_COMPLETED, HANDLING_RESULT_UNCOMPLETED] as const;
export type HandlingResult = typeof HANDLING_RESULT_OPTIONS[number];

export interface HandlingFeedbackItemConfig {
  key: string;
  resultField: string;
  remarkField: string;
  resultLabel: string;
  remarkLabel: string;
}

export interface HandlingFeedbackRule {
  code: string;
  modules: readonly string[];
  items: readonly HandlingFeedbackItemConfig[];
}

export interface HandlingFeedbackEvaluation {
  matched: boolean;
  complete: boolean;
  nextStatus: DispatchedOrderStatus.PROCESSING | DispatchedOrderStatus.COMPLETED;
  normalizedFields: Record<string, string>;
  missingFields: HandlingFeedbackItemConfig[];
}

const SOCIAL_FUND_FEEDBACK_ITEMS: readonly HandlingFeedbackItemConfig[] = [
  { key: 'social', resultField: 'social_insurance_result', remarkField: 'social_insurance_remark', resultLabel: '社保是否办结', remarkLabel: '社保公积金办理备注' },
  { key: 'medical', resultField: 'medical_insurance_result', remarkField: 'social_insurance_remark', resultLabel: '医保是否办结', remarkLabel: '社保公积金办理备注' },
  { key: 'fund', resultField: 'housing_fund_result', remarkField: 'social_insurance_remark', resultLabel: '公积金是否办结', remarkLabel: '社保公积金办理备注' },
];

const HANDLING_FEEDBACK_RULES: readonly HandlingFeedbackRule[] = [
  {
    code: 'social_fund_three_results',
    modules: ['social_insurance', 'resignation_social_insurance'],
    items: SOCIAL_FUND_FEEDBACK_ITEMS,
  },
];

const RESULT_ALIASES: Record<HandlingResult, readonly string[]> = {
  [HANDLING_RESULT_COMPLETED]: ['是', '已完成', '完成', '办结', '已办结', '成功', '办理成功', 'complete', 'completed', 'done', 'success', 'yes', 'true'],
  [HANDLING_RESULT_UNCOMPLETED]: ['否', '未完成', '未办结', '未办', '未成功', '失败', '办理失败', '待处理', '处理中', '办理中', 'pending', 'processing', 'failed', 'fail', 'unfinished', 'incomplete', 'no', 'false'],
};

export function getHandlingFeedbackRule(moduleCode: string): HandlingFeedbackRule | null {
  const normalized = String(moduleCode || '').trim();
  return HANDLING_FEEDBACK_RULES.find((rule) => rule.modules.includes(normalized)) ?? null;
}

export function isHandlingFeedbackModule(moduleCode: string): boolean {
  return Boolean(getHandlingFeedbackRule(moduleCode)) || isSocialInsuranceDispatchModule(moduleCode);
}

export function normalizeHandlingResult(value: unknown): HandlingResult | null {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  for (const [result, aliases] of Object.entries(RESULT_ALIASES) as Array<[HandlingResult, readonly string[]]>) {
    if (aliases.includes(raw) || aliases.includes(lower)) return result;
  }
  return null;
}

export function evaluateHandlingFeedback(moduleCode: string, extraData: Record<string, unknown>): HandlingFeedbackEvaluation {
  const rule = getHandlingFeedbackRule(moduleCode);
  if (!rule) {
    return {
      matched: false,
      complete: false,
      nextStatus: DispatchedOrderStatus.PROCESSING,
      normalizedFields: {},
      missingFields: [],
    };
  }

  const normalizedFields: Record<string, string> = {};
  const missingFields: HandlingFeedbackItemConfig[] = [];
  let complete = true;
  for (const item of rule.items) {
    const normalized = normalizeHandlingResult(extraData[item.resultField]);
    if (!normalized) {
      missingFields.push(item);
      complete = false;
      continue;
    }
    normalizedFields[item.resultField] = normalized;
    if (normalized !== HANDLING_RESULT_COMPLETED) complete = false;
  }

  return {
    matched: true,
    complete,
    nextStatus: complete ? DispatchedOrderStatus.COMPLETED : DispatchedOrderStatus.PROCESSING,
    normalizedFields,
    missingFields,
  };
}

export function getHandlingFeedbackItems(moduleCode: string): readonly HandlingFeedbackItemConfig[] {
  return getHandlingFeedbackRule(moduleCode)?.items ?? [];
}
