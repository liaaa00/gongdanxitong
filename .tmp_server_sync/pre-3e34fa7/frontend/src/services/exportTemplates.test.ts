import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestGet = vi.hoisted(() => vi.fn());

vi.mock('./request', () => ({
  default: {
    get: requestGet,
  },
}));

vi.mock('./mock', () => ({
  isMockMode: false,
  mockDelay: vi.fn(),
}));

describe('export template service', () => {
  beforeEach(() => {
    requestGet.mockReset();
  });

  it('silently falls back when a non-admin cannot read export templates', async () => {
    requestGet.mockRejectedValueOnce(new Error('forbidden'));
    const { getExportTemplates } = await import('./exportTemplates');

    await expect(getExportTemplates('contract')).resolves.toEqual([]);
    expect(requestGet).toHaveBeenCalledWith('/admin/export-templates', {
      params: { moduleCode: 'contract' },
      silentError: true,
    });
  });
});
