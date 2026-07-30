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

  it('reads contract templates through the isolated work-order endpoint', async () => {
    requestGet.mockResolvedValueOnce([{
      id: 'tpl-1',
      templateName: '劳动合同签订批导出模板-速创',
      moduleCode: 'contract',
      fieldList: [{ fieldCode: 'employee_name' }],
      createdBy: 'admin-1',
      isShared: true,
      signPlatform: '速创',
      createdAt: '2026-07-22T00:00:00.000Z',
    }]);
    const { getWorkOrderExportTemplates } = await import('./exportTemplates');

    await expect(getWorkOrderExportTemplates('contract')).resolves.toEqual([
      expect.objectContaining({
        id: 'tpl-1',
        module_code: 'contract',
        is_shared: true,
        sign_platform: '速创',
      }),
    ]);
    expect(requestGet).toHaveBeenCalledWith('/work-order-export-templates/contract', {
      silentError: true,
    });
  });
});
