import request from './request';

export type PortalBusinessPermission = 'employee_changes' | 'salary';
export const PORTAL_BUSINESS_OPTIONS: { value: PortalBusinessPermission; label: string }[] = [
  { value: 'employee_changes', label: '增减员' },
  { value: 'salary', label: '薪资' },
];

/** Accept legacy API rows while exposing the two current account grants. */
export function normalizePortalBusinessPermissions(value: unknown): PortalBusinessPermission[] {
  const raw = Array.isArray(value) ? value : [];
  const normalized: PortalBusinessPermission[] = [];
  if (raw.some((permission) => permission === 'employee_changes' || permission === 'onboarding' || permission === 'resignation')) normalized.push('employee_changes');
  if (raw.includes('salary')) normalized.push('salary');
  return normalized;
}

export interface PortalSubjectItem {
  id: string;
  name: string;
  isPrimary: boolean;
}

export interface CustomerPortalAccountItem {
  id: string;
  customerId: string;
  loginEmail: string;
  contactName: string;
  isActive: boolean;
  mustChangePassword: boolean;
  businessPermissions: PortalBusinessPermission[];
  /** 批次3：账号关联的主体集合与主主体。 */
  subjects?: PortalSubjectItem[];
  primarySubjectId?: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaveCustomerPortalAccountInput {
  loginEmail: string;
  contactName: string;
  password?: string;
  isActive: boolean;
  mustChangePassword?: boolean;
  businessPermissions: PortalBusinessPermission[];
}

export interface SetPortalAccountSubjectsInput {
  subjects: string[];
  primarySubjectId?: string;
}

export function listCustomerPortalAccountSubjects(customerId: string, accountId: string): Promise<{ primarySubjectId: string | null; subjects: PortalSubjectItem[] }> {
  return request.get(`/customer-config/customers/${customerId}/accounts/${accountId}/subjects`);
}

export function setCustomerPortalAccountSubjects(customerId: string, accountId: string, payload: SetPortalAccountSubjectsInput): Promise<{ primarySubjectId: string | null; subjects: PortalSubjectItem[] }> {
  return request.put(`/customer-config/customers/${customerId}/accounts/${accountId}/subjects`, payload);
}

export function getCustomerPortalAccounts(customerId: string): Promise<CustomerPortalAccountItem[]> {
  return request.get(`/customer-config/customers/${customerId}/accounts`).then((rows) =>
    (rows as unknown as CustomerPortalAccountItem[]).map((row) => ({ ...row, businessPermissions: normalizePortalBusinessPermissions(row.businessPermissions) })),
  );
}

export function createCustomerPortalAccount(customerId: string, payload: SaveCustomerPortalAccountInput): Promise<CustomerPortalAccountItem> {
  return request.post(`/customer-config/customers/${customerId}/accounts`, payload).then((row) => ({
    ...(row as unknown as CustomerPortalAccountItem), businessPermissions: normalizePortalBusinessPermissions((row as unknown as CustomerPortalAccountItem).businessPermissions),
  }));
}

export function updateCustomerPortalAccount(customerId: string, accountId: string, payload: Omit<SaveCustomerPortalAccountInput, 'password'>): Promise<CustomerPortalAccountItem> {
  return request.put(`/customer-config/customers/${customerId}/accounts/${accountId}`, payload).then((row) => ({
    ...(row as unknown as CustomerPortalAccountItem), businessPermissions: normalizePortalBusinessPermissions((row as unknown as CustomerPortalAccountItem).businessPermissions),
  }));
}

export function resetCustomerPortalPassword(customerId: string, accountId: string, password: string, mustChangePassword = true): Promise<CustomerPortalAccountItem> {
  return request.post(`/customer-config/customers/${customerId}/accounts/${accountId}/reset-password`, { password, mustChangePassword }).then((row) => ({
    ...(row as unknown as CustomerPortalAccountItem), businessPermissions: normalizePortalBusinessPermissions((row as unknown as CustomerPortalAccountItem).businessPermissions),
  }));
}
