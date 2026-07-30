import { beforeEach, describe, expect, it } from 'vitest';
import {
  BUSINESS_SCOPE,
  BUSINESS_SCOPE_STORAGE_KEY,
  getBusinessScopeLandingPath,
  readBusinessScope,
  writeBusinessScope,
} from './businessScope';

describe('businessScope local persistence', () => {
  beforeEach(() => window.localStorage.clear());

  it('defaults invalid or missing storage to Beilun', () => {
    expect(readBusinessScope()).toBe(BUSINESS_SCOPE.BEILUN);
    window.localStorage.setItem(BUSINESS_SCOPE_STORAGE_KEY, 'invalid');
    expect(readBusinessScope()).toBe(BUSINESS_SCOPE.BEILUN);
  });

  it('persists out-of-province scope and maps both scopes to frontend landing routes', () => {
    writeBusinessScope(BUSINESS_SCOPE.OUT_OF_PROVINCE);
    expect(readBusinessScope()).toBe(BUSINESS_SCOPE.OUT_OF_PROVINCE);
    expect(getBusinessScopeLandingPath(BUSINESS_SCOPE.OUT_OF_PROVINCE)).toBe('/out-of-province');
    expect(getBusinessScopeLandingPath(BUSINESS_SCOPE.BEILUN)).toBe('/dashboard');
  });
});
