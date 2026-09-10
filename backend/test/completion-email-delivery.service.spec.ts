import { WorkOrderCompletionEmail } from 'src/entities';
import { CompletionEmailDeliveryService } from 'src/modules/completion-email-delivery.service';

function task(overrides: Partial<WorkOrderCompletionEmail> = {}): WorkOrderCompletionEmail {
  return {
    id: 'email-1',
    workOrderId: 'wo-1',
    customerId: 'customer-1',
    completedVersion: 1,
    templateCode: 'work-order-completion-result',
    templateVersion: 'v1',
    toRecipients: ['customer@example.com'],
    ccRecipients: ['owner@example.com'],
    replyTo: 'public@example.com',
    subject: '工单WO-1办结结果确认',
    bodySnapshot: '办结结果见附件。',
    attachmentId: 'attachment-1',
    attachmentHash: 'hash',
    status: 'pending',
    attemptCount: 0,
    nextRetryAt: null,
    lastError: null,
    sentAt: null,
    createdAt: new Date('2026-09-03T00:00:00Z'),
    updatedAt: new Date('2026-09-03T00:00:00Z'),
    ...overrides,
  } as WorkOrderCompletionEmail;
}

function makeService(options: {
  enabled?: boolean;
  tasks?: WorkOrderCompletionEmail[];
  maxAttempts?: number;
} = {}) {
  const rows = options.tasks ?? [task()];
  const repository: any = {
    find: jest.fn(async () => rows),
    save: jest.fn(async (value: WorkOrderCompletionEmail) => {
      value.updatedAt = new Date();
      return value;
    }),
  };
  const uploadService: any = {
    resolveFile: jest.fn(async () => ({
      originalName: '工单WO-1-办结结果确认.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filePath: 'uploads/excel/attachment-1.xlsx',
    })),
  };
  const configService: any = {
    get: jest.fn(() => ({
      enabled: options.enabled ?? true,
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      user: 'public@example.com',
      pass: 'secret',
      from: 'public@example.com',
      maxAttempts: options.maxAttempts ?? 3,
    })),
  };
  const service = new CompletionEmailDeliveryService(repository, uploadService, configService);
  return { service, repository, uploadService };
}

describe('CompletionEmailDeliveryService', () => {
  it('does not touch the queue while mail delivery is disabled', async () => {
    const { service, repository } = makeService({ enabled: false });
    await expect(service.processPending()).resolves.toBe(0);
    expect(repository.find).not.toHaveBeenCalled();
  });

  it('sends a pending task with its stored attachment and marks it sent', async () => {
    const row = task();
    const { service, repository, uploadService } = makeService({ tasks: [row] });
    const sendMail = jest.fn(async () => ({ messageId: 'message-1' }));
    jest.spyOn(service as any, 'createTransport').mockReturnValue({ sendMail });
    jest.spyOn(require('node:fs/promises'), 'readFile').mockResolvedValue(Buffer.from('xlsx'));

    await expect(service.processPending()).resolves.toBe(1);
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'public@example.com',
      to: ['customer@example.com'],
      cc: ['owner@example.com'],
      replyTo: 'public@example.com',
      subject: '工单WO-1办结结果确认',
      text: '办结结果见附件。',
      attachments: [expect.objectContaining({
        filename: '工单WO-1-办结结果确认.xlsx',
        content: Buffer.from('xlsx'),
      })],
    }));
    expect(uploadService.resolveFile).toHaveBeenCalledWith('attachment-1');
    expect(row.status).toBe('sent');
    expect(row.sentAt).toBeInstanceOf(Date);
    expect(row.lastError).toBeNull();
    expect(repository.save).toHaveBeenCalledTimes(2);
  });

  it('records a retry time after a failed attempt and stops after max attempts', async () => {
    const row = task({ attemptCount: 2 });
    const { service, repository } = makeService({ tasks: [row], maxAttempts: 3 });
    jest.spyOn(service as any, 'createTransport').mockReturnValue({
      sendMail: jest.fn(async () => { throw new Error('SMTP unavailable'); }),
    });

    await expect(service.processPending()).resolves.toBe(0);
    expect(row.status).toBe('failed');
    expect(row.attemptCount).toBe(3);
    expect(row.lastError).toBe('SMTP unavailable');
    expect(row.nextRetryAt).toBeNull();
    expect(repository.save).toHaveBeenCalledTimes(2);
  });

  it('reclaims a stale sending task through the same delivery path', async () => {
    const row = task({ status: 'sending', updatedAt: new Date(Date.now() - 11 * 60 * 1000) });
    const { service } = makeService({ tasks: [row] });
    const sendMail = jest.fn(async () => ({ messageId: 'message-2' }));
    jest.spyOn(service as any, 'createTransport').mockReturnValue({ sendMail });
    jest.spyOn(require('node:fs/promises'), 'readFile').mockResolvedValue(Buffer.from('xlsx'));

    await expect(service.processPending()).resolves.toBe(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(row.status).toBe('sent');
    // The reclaimed attempt is counted as a new delivery attempt.
    expect(row.attemptCount).toBe(1);
  });
});
