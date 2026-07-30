import request from './request';
import { isMockMode, mockDelay } from './mock';
import { uploadOrderAttachment } from './upload';

export type AttachmentStatus = 'uploaded' | 'rejected' | 'approved' | 'received';

export interface OrderAttachmentItem {
  id: string;
  work_order_id: string;
  dispatched_order_id?: string | null;
  biz_purpose: string;
  file_id?: string;
  file_name: string;
  original_name?: string;
  mime_type?: string;
  file_path?: string;
  file_size: number;
  status: AttachmentStatus;
  reject_reason?: string | null;
  received_at?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  metadata?: Record<string, unknown> | null;
  download_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface UploadOrderAttachmentParams {
  work_order_id: string;
  dispatched_order_id?: string;
  biz_purpose: string;
  material_type?: string;
  status?: AttachmentStatus;
}

const mockAttachments: OrderAttachmentItem[] = [];

function normalizeAttachment(raw: Partial<OrderAttachmentItem> & Record<string, unknown>): OrderAttachmentItem {
  const metadata = (raw.metadata || {}) as Record<string, unknown>;
  return {
    id: String(raw.id || raw.file_id || Date.now()),
    work_order_id: String(raw.work_order_id || ''),
    dispatched_order_id: (raw.dispatched_order_id as string | null | undefined) ?? null,
    biz_purpose: String(raw.biz_purpose || ''),
    file_id: raw.file_id ? String(raw.file_id) : undefined,
    file_name: String(raw.file_name || raw.original_name || raw.file_path || '附件'),
    original_name: raw.original_name ? String(raw.original_name) : undefined,
    mime_type: raw.mime_type ? String(raw.mime_type) : undefined,
    file_path: raw.file_path ? String(raw.file_path) : undefined,
    file_size: Number(raw.file_size || 0),
    status: (raw.status as AttachmentStatus) || 'uploaded',
    reject_reason: (raw.reject_reason as string | null | undefined) ?? null,
    received_at: raw.received_at ? String(raw.received_at) : null,
    reviewed_by: raw.reviewed_by ? String(raw.reviewed_by) : null,
    reviewed_at: raw.reviewed_at ? String(raw.reviewed_at) : null,
    metadata,
    download_url: raw.download_url ? String(raw.download_url) : (raw.file_id ? `/api/files/${String(raw.file_id)}` : undefined),
    created_at: raw.created_at ? String(raw.created_at) : new Date().toISOString(),
    updated_at: raw.updated_at ? String(raw.updated_at) : undefined,
  };
}

export async function listOrderAttachments(params: { work_order_id: string; biz_purpose?: string; status?: string }): Promise<OrderAttachmentItem[]> {
  if (isMockMode) {
    const list = mockAttachments.filter((item) => item.work_order_id === params.work_order_id
      && (!params.biz_purpose || item.biz_purpose === params.biz_purpose)
      && (!params.status || item.status === params.status));
    return mockDelay(list);
  }
  const result = await request.get('/attachments', { params }) as unknown;
  return (Array.isArray(result) ? result : []).map((item) => normalizeAttachment(item as Partial<OrderAttachmentItem> & Record<string, unknown>));
}

export async function uploadMaterialAttachment(file: File, params: UploadOrderAttachmentParams): Promise<OrderAttachmentItem> {
  if (isMockMode) {
    const row = normalizeAttachment({
      id: `att-${Date.now()}`,
      work_order_id: params.work_order_id,
      dispatched_order_id: params.dispatched_order_id || null,
      biz_purpose: params.biz_purpose,
      file_name: file.name,
      original_name: file.name,
      file_size: file.size,
      status: params.status || 'received',
      metadata: { material_type: params.material_type || '其他材料' },
      received_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
    mockAttachments.unshift(row);
    return mockDelay(row);
  }
  const result = await uploadOrderAttachment(file, {
    work_order_id: params.work_order_id,
    dispatched_order_id: params.dispatched_order_id,
    biz_purpose: params.biz_purpose,
    status: params.status || 'received',
    metadata: { material_type: params.material_type || '其他材料' },
  });
  return normalizeAttachment(result as unknown as Partial<OrderAttachmentItem> & Record<string, unknown>);
}

export async function reviewOrderAttachment(id: string, status: 'approved' | 'rejected', rejectReason?: string): Promise<OrderAttachmentItem> {
  if (isMockMode) {
    const idx = mockAttachments.findIndex((item) => item.id === id);
    if (idx >= 0) {
      mockAttachments[idx] = { ...mockAttachments[idx], status, reject_reason: status === 'rejected' ? rejectReason || '材料退回' : null };
      return mockDelay(mockAttachments[idx]);
    }
    throw new Error('附件不存在');
  }
  const result = await request.post(`/attachments/${id}/review`, { status, reject_reason: rejectReason }) as unknown;
  return normalizeAttachment(result as Partial<OrderAttachmentItem> & Record<string, unknown>);
}

export async function receiveOrderAttachment(id: string): Promise<OrderAttachmentItem> {
  if (isMockMode) {
    const idx = mockAttachments.findIndex((item) => item.id === id);
    if (idx >= 0) {
      mockAttachments[idx] = { ...mockAttachments[idx], status: 'received', received_at: new Date().toISOString() };
      return mockDelay(mockAttachments[idx]);
    }
    throw new Error('附件不存在');
  }
  const result = await request.post(`/attachments/${id}/receive`) as unknown;
  return normalizeAttachment(result as Partial<OrderAttachmentItem> & Record<string, unknown>);
}

export async function downloadOrderAttachment(item: OrderAttachmentItem): Promise<void> {
  const fileName = item.original_name || item.file_name || '附件';
  if (isMockMode) {
    const blobUrl = window.URL.createObjectURL(new Blob(['mock attachment data']));
    try {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      a.click();
    } finally {
      window.URL.revokeObjectURL(blobUrl);
    }
    return;
  }
  const url = item.download_url || (item.file_id ? `/api/files/${item.file_id}` : '');
  if (!url) {
    throw new Error('附件下载地址缺失');
  }
  if (/^https?:\/\//i.test(url)) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
    return;
  }
  const token = typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem('token') : null;
  const response = await fetch(url, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    const msg = await response.text().catch(() => '');
    throw new Error(msg || `附件下载失败 (${response.status})`);
  }
  const blob = await response.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    a.click();
  } finally {
    window.URL.revokeObjectURL(blobUrl);
  }
}

export async function deleteOrderAttachment(id: string): Promise<void> {
  if (isMockMode) {
    const idx = mockAttachments.findIndex((item) => item.id === id);
    if (idx >= 0) mockAttachments.splice(idx, 1);
    return mockDelay(undefined);
  }
  await request.delete(`/attachments/${id}`);
}
