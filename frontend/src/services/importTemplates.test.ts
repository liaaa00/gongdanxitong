import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./request', () => ({
  default: { get: vi.fn() },
}));
vi.mock('./mock', () => ({
  isMockMode: false,
  mockDelay: <T>(value: T) => Promise.resolve(value),
}));

import request from './request';
import { getCreateWorkOrderFields } from './importTemplates';

describe('getCreateWorkOrderFields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves regional field metadata returned by the create-fields API', async () => {
    vi.mocked(request.get).mockResolvedValue([{
      fieldCode: 'regional_special_ratio',
      fieldName: '区域特殊比例',
      fieldType: 'dropdown',
      collectionGroup: '社保公积金信息',
      isIncludedInTemplate: false,
      isActive: true,
    }] as never);

    const fields = await getCreateWorkOrderFields('onboarding');

    expect(fields[0]).toEqual(expect.objectContaining({
      field_code: 'regional_special_ratio',
      collection_group: '社保公积金信息',
      is_included_in_template: false,
    }));
  });
});
