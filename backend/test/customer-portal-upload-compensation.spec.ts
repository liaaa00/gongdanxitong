import { Logger } from '@nestjs/common';
import { BusinessScope, WorkOrderCompletionEmail } from 'src/entities';
import { CustomerPortalSubmission } from 'src/entities/customer-portal-submission.entity';
import { CustomerPortalService, PortalInput } from 'src/modules/customer-portal/customer-portal.service';
import { ExcelParserService } from 'src/modules/imports/excel-parser.service';

const customerId = '11111111-1111-4111-8111-111111111111';
const accountId = '22222222-2222-4222-8222-222222222222';
const submissionId = '33333333-3333-4333-8333-333333333333';
const user = { sub: accountId, businessScope: BusinessScope.BEILUN };
const file = { name: 'document.pdf', mimeType: 'application/pdf', bizPurpose: 'salary_attachment', contentBase64: Buffer.from('%PDF-1.7 test').toString('base64') };
const input: PortalInput = { linkToken: 'signed-session', businessType: 'salary', requestId: 'upload-compensation-test', fields: { mode: 'changed', channel: 'attachment', month: '2026-09' }, files: [file] };
type Entry = 'submit' | 'attachments' | 'completeSalary';

function fixture(options: { queueError?: Error; commitError?: Error; commitSucceeded?: boolean; verificationError?: Error; writeErrorAt?: number; completionSaveError?: Error } = {}) {
  let transactionCount = 0;
  let writeCount = 0;
  const committedEmails: WorkOrderCompletionEmail[] = [];
  const pendingEmails: WorkOrderCompletionEmail[] = [];
  const queries: Array<{ transaction: number; sql: string; params?: unknown[] }> = [];
  const uploads = {
    saveBuffer: jest.fn(async () => {
      writeCount += 1;
      if (options.writeErrorAt === writeCount) throw new Error('disk write failed');
      return { fileId: `00000000-0000-4000-8000-${String(writeCount).padStart(12, '0')}` };
    }),
    deleteFile: jest.fn(async (_id: string) => undefined),
  };
  const salary = { id: submissionId, customerId, accountId, requestNo: 'SAL-TEST', businessType: 'salary', status: 'received', fields: { month: '2026-09' } };
  let entry: Entry;
  const submissions = {
    create: jest.fn((row) => ({ id: submissionId, ...row })),
    save: jest.fn(async (row) => {
      if (row.status === 'completed' && options.completionSaveError) throw options.completionSaveError;
      return row;
    }),
    findOne: jest.fn(async () => entry === 'completeSalary' ? { ...salary } : null),
  };
  const mails = {
    create: jest.fn((row) => row),
    save: jest.fn(async (row) => {
      if (options.queueError) throw options.queueError;
      pendingEmails.push(row);
      return row;
    }),
  };
  const dataSource = {
    getRepository: jest.fn(() => ({ find: jest.fn(async () => []), findOne: jest.fn(async () => ({ id: 'assign-1' })) })),
    transaction: jest.fn(async (operation) => {
      const transaction = ++transactionCount;
      const manager = {
        query: jest.fn(async (sql: string, params?: unknown[]) => {
          queries.push({ transaction, sql, params });
          if (transaction > 1 && options.verificationError) throw options.verificationError;
          if (sql.startsWith('SELECT attachment_id')) return committedEmails;
          return [];
        }),
        getRepository: (entity: unknown) => entity === CustomerPortalSubmission ? submissions : mails,
      };
      const result = await operation(manager);
      if (transaction === 1) {
        if (!options.commitError || options.commitSucceeded) committedEmails.push(...pendingEmails);
        if (options.commitError) throw options.commitError;
      }
      return result;
    }),
  };
  const auth = { session: jest.fn(async () => ({ customer: { id: customerId }, account: { id: accountId }, businessPermissions: ['salary'], mustChangePassword: false })) };
  const rules = { findOne: jest.fn(async () => ({ sharedEmailRules: { mailbox: 'shared@example.test' }, completionEmailEnabled: true, completionEmailTo: ['recipient@example.test'], completionEmailCc: [] })) };
  const customers = { findOne: jest.fn(async () => ({ id: customerId, customerName: '配置客户名称' })) };
  const notificationSettings = { render: jest.fn(async () => ({ subject: '共享办结主题', body: '共享办结正文' })) };
  // 批次3：构造函数新增 links 仓库（resolveActiveSubject 依赖），mock 返回主主体关联，避免主主体停用阻断。
  const links = { find: jest.fn(async () => [{ accountId, customerId, isPrimary: true, customer: { id: customerId, customerName: '配置客户名称', isActive: true, businessScope: BusinessScope.BEILUN } }]) };
  const service = new CustomerPortalService(auth as never, dataSource as never, submissions as never, links as never, rules as never, customers as never, {} as never, {} as never, mails as never, {} as never, {} as never, {} as never, {} as never, new ExcelParserService(), uploads as never, {} as never, {} as never, undefined, notificationSettings as never);
  const invoke = (nextEntry: Entry, files = [file]) => {
    entry = nextEntry;
    if (entry === 'completeSalary') return service.completeSalary(submissionId, customerId, '已核验完成', user as never);
    return service[entry]({ ...input, files }, user as never);
  };
  return { invoke, uploads, dataSource, queries, committedEmails, notificationSettings };
}

describe('Customer portal file compensation', () => {
  beforeEach(() => { jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined); });
  afterEach(() => { jest.restoreAllMocks(); });

  it('renders salary completion with the actual customer and queues the shared template with its result attachment', async () => {
    const { invoke, notificationSettings, committedEmails, dataSource } = fixture();
    await expect(invoke('completeSalary')).resolves.toMatchObject({ status: 'completed', resultNote: '已核验完成' });
    expect(notificationSettings.render).toHaveBeenCalledWith('completion', expect.objectContaining({ customer_name: '配置客户名称', order_no: 'SAL-TEST', business_type: '薪资' }), expect.objectContaining({ getRepository: expect.any(Function) }));
    expect(committedEmails).toHaveLength(1);
    expect(committedEmails[0]).toMatchObject({ subject: '共享办结主题', bodySnapshot: '共享办结正文', status: 'pending', attachmentId: expect.any(String) });
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it.each<Entry>(['submit', 'attachments', 'completeSalary'])('removes newly saved files when %s email queue persistence fails', async (entry) => {
    const failure = new Error('queue insert failed');
    const { invoke, uploads, queries } = fixture({ queueError: failure });
    await expect(invoke(entry)).rejects.toBe(failure);
    expect(uploads.saveBuffer).toHaveBeenCalledTimes(1);
    expect(uploads.deleteFile).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
    const locks = queries.filter((query) => query.sql.includes('pg_advisory_xact_lock') && String(query.params?.[0]).startsWith('portal-upload:'));
    expect(locks).toHaveLength(2);
    expect(locks[0].params).toEqual(locks[1].params);
  });

  it('cleans earlier files when a later file write fails', async () => {
    const { invoke, uploads } = fixture({ writeErrorAt: 2 });
    await expect(invoke('attachments', [file, { ...file, name: 'second.pdf' }])).rejects.toThrow('disk write failed');
    expect(uploads.deleteFile).toHaveBeenCalledTimes(1);
    expect(uploads.deleteFile).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
  });

  it('cleans completion output when the salary record save rolls back after email creation', async () => {
    const failure = new Error('completion save failed');
    const { invoke, uploads } = fixture({ completionSaveError: failure });
    await expect(invoke('completeSalary')).rejects.toBe(failure);
    expect(uploads.deleteFile).toHaveBeenCalledTimes(1);
  });

  it.each<Entry>(['submit', 'attachments', 'completeSalary'])('cleans %s files after a verified failed commit', async (entry) => {
    const failure = new Error('commit rejected');
    const { invoke, uploads } = fixture({ commitError: failure });
    await expect(invoke(entry)).rejects.toBe(failure);
    expect(uploads.deleteFile).toHaveBeenCalledTimes(1);
  });

  it.each<Entry>(['submit', 'attachments', 'completeSalary'])('retains %s files when commit succeeded but its response was lost', async (entry) => {
    const failure = new Error('commit connection lost');
    const { invoke, uploads, committedEmails } = fixture({ commitError: failure, commitSucceeded: true });
    await expect(invoke(entry)).rejects.toBe(failure);
    expect(committedEmails).toHaveLength(1);
    expect(uploads.deleteFile).not.toHaveBeenCalled();
  });

  it('retains files and the original error when commit verification cannot reach the database', async () => {
    const failure = new Error('commit connection lost');
    const { invoke, uploads } = fixture({ commitError: failure, verificationError: new Error('database offline') });
    await expect(invoke('attachments')).rejects.toBe(failure);
    expect(uploads.deleteFile).not.toHaveBeenCalled();
    expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('commit state could not be verified'));
  });

  it('retains all files following a successful commit', async () => {
    const { invoke, uploads, dataSource } = fixture();
    await expect(invoke('attachments')).resolves.toMatchObject({ ok: true });
    expect(uploads.deleteFile).not.toHaveBeenCalled();
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('continues cleanup for other files without hiding the business failure when deletion fails', async () => {
    const failure = new Error('queue insert failed');
    const { invoke, uploads } = fixture({ queueError: failure });
    uploads.deleteFile.mockRejectedValueOnce(new Error('file locked'));
    await expect(invoke('attachments', [file, { ...file, name: 'second.pdf' }])).rejects.toBe(failure);
    expect(uploads.deleteFile).toHaveBeenCalledTimes(2);
  });
});
