import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
const createObjectURLMock = vi.fn(() => 'blob:mock');
const revokeObjectURLMock = vi.fn();
const clickMock = vi.fn();

vi.mock('./mock', () => ({
  isMockMode: false,
  mockDelay: <T>(data: T) => Promise.resolve(data),
}));

vi.mock('./request', () => ({
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('./notifications', () => ({ addMockNotification: vi.fn() }));
vi.mock('./workOrders', () => ({ reloadMockWorkOrders: vi.fn() }));

import { downloadDispatchedExport } from './dispatchedOrders';

describe('downloadDispatchedExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'fetch', { value: fetchMock, writable: true });
    Object.defineProperty(window, 'URL', {
      value: {
        createObjectURL: createObjectURLMock,
        revokeObjectURL: revokeObjectURLMock,
      },
      writable: true,
    });
    window.localStorage.setItem('token', 'token-123');
    fetchMock.mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(new Blob(['excel-data'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })),
    });
    document.body.innerHTML = '';
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        return {
          href: '',
          download: '',
          click: clickMock,
        } as unknown as HTMLAnchorElement;
      }
      return document.createElement(tagName);
    });
  });

  it('downloads export file through authenticated fetch instead of direct link navigation', async () => {
    await downloadDispatchedExport({ fileId: 'file-1', fileName: '导出.xlsx' }, 'fallback.xlsx');

    expect(fetchMock).toHaveBeenCalledWith('/api/files/file-1', expect.objectContaining({
      method: 'GET',
      headers: { Authorization: 'Bearer token-123' },
    }));
    expect(createObjectURLMock).toHaveBeenCalled();
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock');
  });
});
