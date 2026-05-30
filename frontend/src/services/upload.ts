import request from './request';
import { isMockMode, mockDelay } from './mock';

export interface FileInfo {
  id?: string;
  fileId?: string;
  filename?: string;
  fileName?: string;
  original_name?: string;
  originalName?: string;
  size: number;
  mime_type?: string;
  mimeType?: string;
  url?: string;
  downloadUrl?: string;
  created_at?: string;
  createdAt?: string;
}

export async function uploadExcel(file: File): Promise<FileInfo> {
  if (isMockMode) {
    return mockDelay({
      id: 'f1',
      fileId: 'f1',
      filename: file.name,
      fileName: file.name,
      original_name: file.name,
      originalName: file.name,
      size: file.size,
      mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      url: '/api/files/mock',
      downloadUrl: '/api/files/mock',
      created_at: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
  }
  const formData = new FormData();
  formData.append('file', file);
  return request.post('/upload/excel', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }) as Promise<FileInfo>;
}

export async function uploadOrderAttachment(file: File, payload: { work_order_id: string; dispatched_order_id?: string; biz_purpose?: string; status?: string; metadata?: Record<string, unknown> }): Promise<FileInfo> {
  if (isMockMode) {
    return mockDelay({
      id: 'att-' + Date.now(),
      fileId: 'att-' + Date.now(),
      filename: file.name,
      fileName: file.name,
      original_name: file.name,
      originalName: file.name,
      size: file.size,
      mime_type: file.type,
      mimeType: file.type,
      url: '/api/files/mock',
      downloadUrl: '/api/files/mock',
      created_at: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
  }
  const formData = new FormData();
  formData.append('file', file);
  formData.append('work_order_id', payload.work_order_id);
  if (payload.dispatched_order_id) formData.append('dispatched_order_id', payload.dispatched_order_id);
  formData.append('biz_purpose', payload.biz_purpose || 'resignation_material');
  if (payload.status) formData.append('status', payload.status);
  if (payload.metadata) formData.append('metadata', JSON.stringify(payload.metadata));
  return request.post('/attachments/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }) as Promise<FileInfo>;
}

export async function uploadAttachment(file: File): Promise<FileInfo> {
  if (isMockMode) {
    return mockDelay({
      id: 'f2',
      fileId: 'f2',
      filename: file.name,
      fileName: file.name,
      original_name: file.name,
      originalName: file.name,
      size: file.size,
      mime_type: file.type,
      mimeType: file.type,
      url: '/api/files/mock',
      downloadUrl: '/api/files/mock',
      created_at: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
  }
  const formData = new FormData();
  formData.append('file', file);
  return request.post('/upload/attachment', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }) as Promise<FileInfo>;
}

export function getFileDownloadUrl(id: string): string {
  return `/api/files/${id}`;
}
