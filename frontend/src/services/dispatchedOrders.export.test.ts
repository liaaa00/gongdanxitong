import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadDispatchedExport } from './dispatchedOrders';

describe('dispatched export downloads', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window.URL, 'createObjectURL', { value: vi.fn(() => 'blob:export'), configurable: true });
    Object.defineProperty(window.URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
  });

  it('downloads every file returned by a batch export', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(['file']),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const click = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue({ click } as unknown as HTMLElement);

    await downloadDispatchedExport({
      files: [
        { fileId: 'excel-1', fileName: '合同.xlsx', downloadUrl: '/api/files/excel-1', fileType: 'excel' },
        { fileId: 'zip-1', fileName: '合同-附件.zip', downloadUrl: '/api/files/zip-1', fileType: 'attachments_zip' },
      ],
    }, '批量导出.xlsx');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      '/api/files/excel-1',
      '/api/files/zip-1',
    ]);
    expect(click).toHaveBeenCalledTimes(2);
  });
});
