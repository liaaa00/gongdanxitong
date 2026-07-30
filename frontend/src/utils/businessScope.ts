export const BUSINESS_SCOPE_STORAGE_KEY = 'business_scope_v1';

export const BUSINESS_SCOPE = {
  BEILUN: 'beilun',
  OUT_OF_PROVINCE: 'out_of_province',
} as const;

export type BusinessScope = (typeof BUSINESS_SCOPE)[keyof typeof BUSINESS_SCOPE];

export function readBusinessScope(): BusinessScope {
  try {
    return localStorage.getItem(BUSINESS_SCOPE_STORAGE_KEY) === BUSINESS_SCOPE.OUT_OF_PROVINCE
      ? BUSINESS_SCOPE.OUT_OF_PROVINCE
      : BUSINESS_SCOPE.BEILUN;
  } catch {
    return BUSINESS_SCOPE.BEILUN;
  }
}

export function writeBusinessScope(scope: BusinessScope): void {
  try {
    localStorage.setItem(BUSINESS_SCOPE_STORAGE_KEY, scope);
  } catch { /* ignore unavailable storage */ }
}

export function getBusinessScopeLandingPath(scope: BusinessScope): string {
  return scope === BUSINESS_SCOPE.OUT_OF_PROVINCE ? '/out-of-province' : '/dashboard';
}
