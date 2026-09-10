import request from './request';
import type { PageParams, PageResult } from './mock';

export type CompletionBusinessType = 'onboarding' | 'resignation' | 'salary';
export type RuleValue = string | number | boolean;

export interface SalaryRules {
  billingDay: number | null;
  reminderEnabled: boolean;
  reminderWorkdayOffsets: [3, 2, 1];
}

export interface SharedEmailRules {
  mailbox: string;
  routeKey: string;
}

export interface CustomerRuleItem {
  customerId: string;
  customerCode: string;
  customerName: string;
  configured: boolean;
  onboardingDefaults: Record<string, RuleValue>;
  resignationDefaults: Record<string, RuleValue>;
  salaryRules: SalaryRules;
  sharedEmailRules: SharedEmailRules;
  completionEmailEnabled: boolean;
  completionEmailTo: string[];
  completionEmailCc: string[];
  completionEmailReplyTo: string | null;
  completionEmailBusinessTypes: CompletionBusinessType[];
  completionEmailFields: string[];
  objectionDeadlineDays: number | null;
  isActive: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
  readiness?: { ready: boolean; missing: string[] };
}

export interface SaveCustomerRuleInput {
  onboardingDefaults?: Record<string, RuleValue | undefined | null>;
  resignationDefaults?: Record<string, RuleValue | undefined | null>;
  salaryRules?: Partial<SalaryRules>;
  sharedEmailRules?: Partial<SharedEmailRules>;
  completionEmailEnabled?: boolean;
  completionEmailTo?: string[];
  completionEmailCc?: string[];
  completionEmailReplyTo?: string | null;
  completionEmailBusinessTypes?: CompletionBusinessType[];
  completionEmailFields?: string[];
  objectionDeadlineDays?: number | null;
  isActive?: boolean;
}

// 客户规则属于真实业务配置，即使其他页面处于演示模式也必须读写后端，禁止写入 localStorage。
export async function getCustomerRules(params: PageParams): Promise<PageResult<CustomerRuleItem>> {
  const result = await request.get('/customer-rules', { params }) as PageResult<CustomerRuleItem>;
  return { ...result, success: true };
}

export function getCustomerRule(customerId: string): Promise<CustomerRuleItem> {
  return request.get(`/customer-rules/${customerId}`) as Promise<CustomerRuleItem>;
}

export function updateCustomerRule(customerId: string, payload: SaveCustomerRuleInput): Promise<CustomerRuleItem> {
  return request.put(`/customer-rules/${customerId}`, payload) as Promise<CustomerRuleItem>;
}

export async function getAllCustomerRules(keyword?: string): Promise<CustomerRuleItem[]> {
  const list: CustomerRuleItem[] = [];
  for (let page = 1; ; page += 1) {
    const result = await getCustomerRules({ page, pageSize: 200, keyword });
    list.push(...result.list);
    if (list.length >= result.total || result.list.length === 0) break;
  }
  return list;
}

export interface BatchCustomerRuleRow {
  rowNumber?: number;
  customerId: string;
  rule: SaveCustomerRuleInput;
}

export interface BatchRuleImportResult {
  total: number;
  successCount: number;
  failedCount: number;
  results: Array<{ customerId: string; success: boolean; message: string; rowNumber?: number; customerCode?: string; customerName?: string }>;
}

export function batchUpdateCustomerRules(rows: BatchCustomerRuleRow[]): Promise<BatchRuleImportResult> {
  return request.post('/customer-rules/batch', { rows }) as Promise<BatchRuleImportResult>;
}

export interface ImportRulesFromOrdersResult {
  customerCount: number;
  importedCount: number;
  skippedCount: number;
  sourceOrderCount?: number;
  failedCount?: number;
  results?: Array<{ customerId: string; customerName?: string; customerCode?: string; success?: boolean; status?: string; message: string }>;
}

export function importCustomerRulesFromOrders(customerIds?: string[]): Promise<ImportRulesFromOrdersResult> {
  return request.post('/customer-rules/import-from-orders', { customerIds }) as Promise<ImportRulesFromOrdersResult>;
}
