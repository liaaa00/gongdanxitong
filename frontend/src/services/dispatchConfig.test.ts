import { describe, expect, it } from 'vitest';
import { normalizeDispatchConfigItem } from './dispatchConfig';

describe('dispatch config display mapping', () => {
  it('keeps internal module codes for payloads but prioritizes API Chinese names', () => {
    const item = normalizeDispatchConfigItem({
      source: 'handlers',
      module: 'isc_l1_registration',
      module_code: 'isc_l1_registration',
      moduleName: '参保登记类',
      sub_module: 'isc_l1_registration',
    });

    expect(item.module).toBe('参保登记类');
    expect(item.module_code).toBe('isc_l1_registration');
    expect(item.moduleName).toBe('参保登记类');
  });

  it('does not fabricate a technical-code display name when the API has no label', () => {
    const item = normalizeDispatchConfigItem({
      source: 'handlers',
      module: 'isc_l2_archive_transfer',
      module_code: 'isc_l2_archive_transfer',
      sub_module: 'isc_l2_archive_transfer',
    });

    expect(item.module).toBe('isc_l2_archive_transfer');
    expect(item.module_name).toBeUndefined();
  });
});
