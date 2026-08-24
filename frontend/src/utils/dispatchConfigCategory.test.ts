import { describe, expect, it } from 'vitest';
import {
  getDispatchCategory,
  getDispatchCategoryOrder,
} from './dispatchConfigCategory';

describe('dispatch config categories', () => {
  it('groups configured modules by business phase', () => {
    expect(getDispatchCategory('data_entry')).toBe('onboarding');
    expect(getDispatchCategory('renewal_contract')).toBe('in_service');
    expect(getDispatchCategory('data_entry_resign')).toBe('resignation');
  });

  it('puts unknown or compatibility modules last', () => {
    expect(getDispatchCategory('legacy_module')).toBe('system');
    expect(getDispatchCategoryOrder('legacy_module')).toBe(3);
  });
});
