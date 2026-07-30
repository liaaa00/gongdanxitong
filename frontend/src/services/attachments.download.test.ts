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
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('./upload', () => ({ uploadOrderAttachment: vi.fn() }));

import { downloadOrderAttachment, type OrderAttachmentItem } from './attachments';

function makeItem(overrides: Partial<OrderAttachmentItem> = {}): OrderAttachmentItem {
  return {
    id: 'att-1',
    work_order_id: 'wo-1',
    biz_purpose: 'resignation_material',
    file_id: 'file-9',
    file_name: 'stored-uuid.pdf',
    original_name: '离职证明.pdf',
    file_size: 2048,
    status: 'uploaded',
    download_url: '/api/files/file-9',
    ...overrides,
  };
}

describe('downloadOrderAttachment', () => {
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
      blob: vi.fn().mockResolvedValue(new Blob(['file-data'], { type: 'application/pdf' })),
    });
    document.body.innerHTML = '';
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        return { href: '', download: '', click: clickMock } as unknown as HTMLAnchorElement;
      }
      return document.createElement(tagName);
    });
  });

  it('downloads the attachment through authenticated fetch instead of bare window.open', async () => {
    await downloadOrderAttachment(makeItem());

    expect(fetchMock).toHaveBeenCalledWith('/api/files/file-9', expect.objectContaining({
      method: 'GET',
      headers: { Authorization: 'Bearer token-123' },
    }));
    expect(createObjectURLMock).toHaveBeenCalled();
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock');
  });

  it('throws when the download response is not ok', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue(''),
    });

    await expect(downloadOrderAttachment(makeItem())).rejects.toThrow();
    expect(clickMock).not.toHaveBeenCalled();
  });

  it('opens external hyperlink attachments directly without authenticated fetch', async () => {
    await downloadOrderAttachment(makeItem({ download_url: 'https://example.com/proof.pdf', file_id: undefined }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(clickMock).toHaveBeenCalledTimes(1);
  });

});
