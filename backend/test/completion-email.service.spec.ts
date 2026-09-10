import { CustomerPortalRule, OrderType, WorkOrder, WorkOrderCompletionEmail } from 'src/entities';
import { CompletionEmailService } from 'src/modules/completion-email.service';

function workOrder(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    orderNo: 'WO-20260903-001',
    orderType: OrderType.ONBOARDING,
    customerId: '22222222-2222-4222-8222-222222222222',
    employeeName: '\u6d4b\u8bd5\u5458\u5de5',
    employeeIdCard: '330101199001010011',
    extraData: { social_base: 5000, bank_account: '6222000000000000' },
    completionVersion: 1,
    ...overrides,
  } as WorkOrder;
}

function rule(overrides: Partial<CustomerPortalRule> = {}): CustomerPortalRule {
  return {
    customerId: '22222222-2222-4222-8222-222222222222',
    isActive: true,
    completionEmailEnabled: true,
    completionEmailTo: ['customer@example.com'],
    completionEmailCc: ['owner@example.com'],
    completionEmailReplyTo: 'public@example.com',
    completionEmailBusinessTypes: [],
    objectionDeadlineDays: 3,
    ...overrides,
  } as CustomerPortalRule;
}

function makeService(options: {
  configuredRule?: CustomerPortalRule | null;
  existing?: WorkOrderCompletionEmail | null;
} = {}) {
  const savedByVersion = new Map<number, WorkOrderCompletionEmail>();
  if (options.existing) savedByVersion.set(options.existing.completedVersion, options.existing);
  const emailRepository: any = {
    findOne: jest.fn(async ({ where }: { where: { completedVersion: number } }) => savedByVersion.get(where.completedVersion) ?? null),
    create: jest.fn((value: Partial<WorkOrderCompletionEmail>) => value),
    save: jest.fn(async (value: WorkOrderCompletionEmail) => {
      const saved = { ...value, id: value.id ?? 'email-1' } as WorkOrderCompletionEmail;
      savedByVersion.set(saved.completedVersion, saved);
      return saved;
    }),
  };
  const ruleRepository: any = {
    findOne: jest.fn(async () => options.configuredRule ?? null),
  };
  const uploadService: any = {
    saveBuffer: jest.fn(async (input: { originalName: string; buffer: Buffer }) => ({
      fileId: 'attachment-1',
      fileName: 'attachment-1.xlsx',
      originalName: input.originalName,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: input.buffer.length,
      kind: 'excel',
      filePath: 'uploads/excel/attachment-1.xlsx',
    })),
  };
  return {
    service: new CompletionEmailService(emailRepository, ruleRepository, uploadService),
    emailRepository,
    ruleRepository,
    uploadService,
  };
}

describe('CompletionEmailService', () => {
  it.each([
    ['no active rule', null],
    ['email disabled', rule({ completionEmailEnabled: false })],
    ['no recipients', rule({ completionEmailTo: [] })],
  ])('does not queue when %s', async (_label, configuredRule) => {
    const { service, emailRepository, uploadService } = makeService({ configuredRule });
    await expect(service.enqueueForCompletedWorkOrder(workOrder())).resolves.toBeNull();
    expect(emailRepository.save).not.toHaveBeenCalled();
    expect(uploadService.saveBuffer).not.toHaveBeenCalled();
  });

  it('does not queue when the work-order type is not enabled', async () => {
    const { service, emailRepository } = makeService({
      configuredRule: rule({ completionEmailBusinessTypes: [OrderType.RESIGNATION] }),
    });
    await expect(service.enqueueForCompletedWorkOrder(workOrder())).resolves.toBeNull();
    expect(emailRepository.save).not.toHaveBeenCalled();
  });

  it('queues a pending result email with a generated Excel attachment and snapshots', async () => {
    const { service, emailRepository, uploadService } = makeService({ configuredRule: rule() });
    const result = await service.enqueueForCompletedWorkOrder(workOrder());

    expect(result).toMatchObject({
      workOrderId: '11111111-1111-4111-8111-111111111111',
      customerId: '22222222-2222-4222-8222-222222222222',
      completedVersion: 1,
      templateCode: 'work-order-completion-result',
      templateVersion: 'v1',
      toRecipients: ['customer@example.com'],
      ccRecipients: ['owner@example.com'],
      replyTo: 'public@example.com',
      status: 'pending',
      attemptCount: 0,
      attachmentId: 'attachment-1',
      attachmentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(result?.bodySnapshot).toContain('\u903e\u671f\u672a\u53cd\u9988\u89c6\u4e3a\u786e\u8ba4\u7ed3\u679c\u65e0\u8bef');
    expect(uploadService.saveBuffer).toHaveBeenCalledWith(expect.objectContaining({
      originalName: '\u5de5\u5355WO-20260903-001-\u529e\u7ed3\u7ed3\u679c\u786e\u8ba4.xlsx',
      kind: 'excel',
    }));
    expect((uploadService.saveBuffer.mock.calls[0][0] as { buffer: Buffer }).buffer.length).toBeGreaterThan(0);
    expect(emailRepository.save).toHaveBeenCalledTimes(1);
  });

  it('returns the existing task instead of creating a duplicate for the same completion version', async () => {
    const existing = { id: 'email-existing', completedVersion: 2 } as WorkOrderCompletionEmail;
    const { service, emailRepository, uploadService } = makeService({ configuredRule: rule(), existing });
    const result = await service.enqueueForCompletedWorkOrder(workOrder({ completionVersion: 2 }));

    expect(result).toBe(existing);
    expect(emailRepository.save).not.toHaveBeenCalled();
    expect(uploadService.saveBuffer).not.toHaveBeenCalled();
  });

  it('allows a new queue task after the work order is completed again with a new version', async () => {
    const { service, emailRepository } = makeService({ configuredRule: rule() });
    const first = await service.enqueueForCompletedWorkOrder(workOrder({ completionVersion: 1 }));
    const second = await service.enqueueForCompletedWorkOrder(workOrder({ completionVersion: 2 }));

    expect(first?.completedVersion).toBe(1);
    expect(second?.completedVersion).toBe(2);
    expect(emailRepository.save).toHaveBeenCalledTimes(2);
  });
});
