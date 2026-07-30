import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
const createObjectURLMock = vi.fn(() => 'blob:mock');
const revokeObjectURLMock = vi.fn();
const clickMock = vi.fn();
const openMock = vi.fn();

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

import { downloadImportErrorReport } from './workOrders';

describe('downloadImportErrorReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'fetch', { value: fetchMock, writable: true });
    Object.defineProperty(window, 'open', { value: openMock, writable: true });
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
      headers: { get: () => 'attachment; filename="error.xlsx"' },
      blob: vi.fn().mockResolvedValue(new Blob(['excel-data'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })),
    });
    document.body.innerHTML = '';
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        return { href: '', download: '', click: clickMock } as unknown as HTMLAnchorElement;
      }
      return document.createElement(tagName);
    });
  });

  it('downloads the error report via authenticated fetch instead of window.open', async () => {
    await downloadImportErrorReport('job-1');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/work-orders/import/jobs/job-1/error-report',
      expect.objectContaining({ headers: { Authorization: 'Bearer token-123' } }),
    );
    expect(openMock).not.toHaveBeenCalled();
    expect(createObjectURLMock).toHaveBeenCalled();
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock');
  });

  it('throws when the server responds with an error status', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: vi.fn().mockResolvedValue(''),
    });

    await expect(downloadImportErrorReport('job-x')).rejects.toThrow();
    expect(openMock).not.toHaveBeenCalled();
  });
});
