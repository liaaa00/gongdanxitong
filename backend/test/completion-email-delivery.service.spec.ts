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
  repository?: any;
} = {}) {
  const rows = options.tasks ?? [task()];
  const repository: any = options.repository ?? {
    find: jest.fn(async () => rows.map((row) => ({ ...row }))),
    update: jest.fn(async (where: Record<string, any>, value: Partial<WorkOrderCompletionEmail>) => {
      const row = rows.find((item) => Object.entries(where).every(([key, expected]) => {
        const current = (item as any)[key];
        if (expected && typeof expected === 'object' && expected.type === 'isNull') return current == null;
        if (expected && typeof expected === 'object' && expected.type === 'lessThanOrEqual') return current != null && current <= expected.value;
        return current === expected;
      }));
      if (!row) return { affected: 0 };
      Object.assign(row, value);
      return { affected: 1 };
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
  const eligibility = { evaluate: jest.fn(async (row: WorkOrderCompletionEmail): Promise<{ recipients: string[]; cancelReason?: string }> => ({ recipients: row.toRecipients })) };
  const service = new CompletionEmailDeliveryService(repository, uploadService, configService, eligibility as any);
  return { service, repository, uploadService, eligibility, configService };
}

describe('CompletionEmailDeliveryService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('atomically claims a queue task across two workers', async () => {
    const row = task({ attachmentId: null });
    const first = makeService({ tasks: [row] });
    const second = makeService({ repository: first.repository });
    const sendMail = jest.fn(async () => ({ messageId: 'shared' }));
    jest.spyOn(first.service as any, 'createTransport').mockReturnValue({ sendMail });
    jest.spyOn(second.service as any, 'createTransport').mockReturnValue({ sendMail });
    const results = await Promise.all([first.service.processPending(), second.service.processPending()]);
    expect(results.reduce((a, b) => a + b, 0)).toBe(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(row.attemptCount).toBe(1);
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ messageId: '<portal-queue-email-1@ticket-system.local>' }));
  });

  it('cancels a queued reminder when the customer has submitted or lost eligibility before sending', async () => {
    const row = task({ attachmentId: null });
    const { service, eligibility } = makeService({ tasks: [row] });
    eligibility.evaluate.mockResolvedValue({ recipients: [], cancelReason: '客户已提交该所属期薪资，无需继续提醒' });
    const transport = jest.spyOn(service as any, 'createTransport');
    await expect(service.processPending()).resolves.toBe(0);
    expect(row.status).toBe('cancelled');
    expect(transport).not.toHaveBeenCalled();
  });

  it('marks missing SMTP configuration failed and does not steal a live sending lease', async () => {
    const pending = task({ attachmentId: null });
    const live = task({ id: 'email-live', status: 'sending', updatedAt: new Date() });
    const { service, configService } = makeService({ tasks: [pending, live] });
    configService.get.mockReturnValue({ enabled: true, host: '', from: '', port: 465, maxAttempts: 3 });
    const transport = jest.spyOn(service as any, 'createTransport');
    await expect(service.processPending()).resolves.toBe(0);
    expect(pending).toMatchObject({ status: 'failed', nextRetryAt: null, lastError: expect.stringContaining('尚未配置') });
    expect(live.status).toBe('sending');
    expect(transport).not.toHaveBeenCalled();
  });

  it('preserves the new claim when a stale worker tries to finalize it', async () => {
    const row = task({ status: 'sending', claimToken: 'new-claim' });
    const { service } = makeService({ tasks: [row] });
    await expect((service as any).finishClaim({ ...row, claimToken: 'old-claim' }, { status: 'sent' })).resolves.toBe(false);
    expect(row.status).toBe('sending');
    expect(row.claimToken).toBe('new-claim');
  });

  it('sets a future exponential retry time for a transient failure', async () => {
    const row = task({ attachmentId: null });
    const { service } = makeService({ tasks: [row] });
    jest.spyOn(service as any, 'createTransport').mockReturnValue({ sendMail: jest.fn(async () => { throw new Error('temporary'); }) });
    const before = Date.now();
    await service.processPending();
    expect(row.status).toBe('failed');
    expect(row.nextRetryAt!.getTime()).toBeGreaterThanOrEqual(before + 5 * 60 * 1000);
    expect(row.attemptCount).toBe(1);
  });

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
    expect(repository.update).toHaveBeenCalledTimes(2);
  });

  it('records a retry time after a failed attempt and stops after max attempts', async () => {
    const row = task({ attemptCount: 2, attachmentId: null });
    const { service, repository } = makeService({ tasks: [row], maxAttempts: 3 });
    jest.spyOn(service as any, 'createTransport').mockReturnValue({
      sendMail: jest.fn(async () => { throw new Error('SMTP unavailable'); }),
    });

    await expect(service.processPending()).resolves.toBe(0);
    expect(row.status).toBe('failed');
    expect(row.attemptCount).toBe(3);
    expect(row.lastError).toBe('SMTP unavailable');
    expect(row.nextRetryAt).toBeNull();
    expect(repository.update).toHaveBeenCalledTimes(2);
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
