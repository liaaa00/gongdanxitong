import { describe, expect, it } from 'vitest';
import {
  getDispatchCategory,
  getDispatchCategoryOrder,
  isDefaultDispatchModuleVisible,
  shouldShowDefaultDispatchRow,
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

  it('hides export, historical, and classification nodes from the default list', () => {
    expect(isDefaultDispatchModuleVisible('payroll_bank_card')).toBe(false);
    expect(isDefaultDispatchModuleVisible('resignation_cert')).toBe(false);
    expect(isDefaultDispatchModuleVisible('isc_l1_registration')).toBe(false);
    expect(isDefaultDispatchModuleVisible('isc_l2_archive_transfer')).toBe(false);
    expect(isDefaultDispatchModuleVisible('isc_l3_detail')).toBe(false);
    expect(isDefaultDispatchModuleVisible('contract')).toBe(true);
  });

  it('shows configured modules by default and allows reviewing other business modules', () => {
    expect(shouldShowDefaultDispatchRow('contract', true, false)).toBe(true);
    expect(shouldShowDefaultDispatchRow('benefit', false, false)).toBe(false);
    expect(shouldShowDefaultDispatchRow('benefit', false, true)).toBe(true);
    expect(shouldShowDefaultDispatchRow('payroll_bank_card', true, true)).toBe(false);
  });
});
