import { describe, expect, it } from 'vitest';
import { buildModuleLabelMap, type ModuleConfigItem } from './moduleConfigs';

describe('buildModuleLabelMap', () => {
  it('uses current module names for dynamic in-service module codes', () => {
    const modules: ModuleConfigItem[] = [
      {
        id: '1',
        module_code: 'isc_l1_registration',
        module_name: '参保登记类',
        is_active: true,
      },
      {
        id: '2',
        module_code: 'isc_l2_employment_certificate',
        module_name: '就业证明开具',
        is_active: true,
      },
    ];

    expect(buildModuleLabelMap(modules)).toEqual({
      isc_l1_registration: '参保登记类',
      isc_l2_employment_certificate: '就业证明开具',
    });
  });

  it('accepts API camelCase module fields', () => {
    expect(buildModuleLabelMap([{
      id: '3',
      module_code: '',
      module_name: '',
      moduleCode: 'isc_l2_archive_transfer',
      moduleName: '档案转移',
      is_active: true,
    }])).toEqual({ isc_l2_archive_transfer: '档案转移' });
  });
});
