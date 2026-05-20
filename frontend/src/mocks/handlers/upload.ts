import { http, HttpResponse } from 'msw';
import { ok } from '../utils';

export const uploadHandlers = [
  http.post('/api/upload/excel', async () => {
    return ok({ id: 'file-excel-1', url: '/api/files/excel-uploaded.xlsx', filename: 'upload.xlsx' });
  }),

  http.post('/api/upload/attachment', async () => {
    return ok({ id: 'att-1', url: '/api/files/attachment.jpg', filename: 'attachment.jpg' });
  }),

  http.get('/api/files/:id', async () => {
    return new HttpResponse('mock binary file content', {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
  }),

  http.post('/api/dispatched-orders/:id/export', async () => {
    return new HttpResponse(new Blob(['mock xlsx export'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
  }),

  http.post('/api/dispatched-orders/batch-export', async () => {
    return new HttpResponse(new Blob(['mock batch export'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
  }),
];
