import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestGet = vi.hoisted(() => vi.fn());

vi.mock('./request', () => ({
  default: {
    get: requestGet,
  },
}));

describe('detail view template service', () => {
  beforeEach(() => requestGet.mockReset());

  it('loads the active template with an explicit business scope', async () => {
    requestGet.mockResolvedValueOnce({ id: 'tpl-1', fieldList: [{ fieldCode: 'province' }] });
    const { getActiveDetailViewTemplate } = await import('./detailViewTemplates');

    await getActiveDetailViewTemplate('out_of_province_increase', 'out_of_province');

    expect(requestGet).toHaveBeenCalledWith(
      '/admin/detail-view-templates/active/out_of_province_increase',
      { params: { businessScope: 'out_of_province' }, silentError: true },
    );
  });

  it('keeps the business scope when falling back to the list endpoint', async () => {
    requestGet
      .mockRejectedValueOnce(new Error('legacy backend'))
      .mockResolvedValueOnce([{ id: 'tpl-2', isActive: true, fieldList: [{ fieldCode: 'employee_name' }] }]);
    const { getActiveDetailViewTemplate } = await import('./detailViewTemplates');

    await expect(getActiveDetailViewTemplate('in_service_certificate', 'beilun'))
      .resolves.toMatchObject({ id: 'tpl-2' });
    expect(requestGet).toHaveBeenLastCalledWith('/admin/detail-view-templates', {
      params: { moduleCode: 'in_service_certificate', businessScope: 'beilun' },
      silentError: true,
    });
  });
});
