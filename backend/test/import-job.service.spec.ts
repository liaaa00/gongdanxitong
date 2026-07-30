import { Repository } from 'typeorm';
import { HttpStatus } from '@nestjs/common';
import { Customer, CustomerAssignee, ImportJob, ImportJobStatus } from 'src/entities';
import { businessException } from 'src/common/exceptions/business-exception';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { ImportJobService } from 'src/modules/imports/import-job.service';
import { ImportFieldValidationService } from 'src/modules/imports/field-validation.service';
import { ImportErrorExcelService } from 'src/modules/imports/error-excel.service';
import { WorkOrderImportService } from 'src/modules/imports/work-order-import.service';
import { UploadsService } from 'src/modules/uploads/uploads.service';
import { ExcelParserService } from 'src/modules/imports/excel-parser.service';
import { AiMappingService } from 'src/modules/ai/ai-mapping.service';
import { AttachmentsService } from 'src/modules/attachments/attachments.service';

function createRepoMock<T>() {
  return {
    create: jest.fn((input: Partial<T>) => input as T),
    save: jest.fn(async (input: T | Partial<T>) => input as T),
    findOne: jest.fn() as jest.Mock,
    update: jest.fn(async () => undefined),
  };
}

function makeUser(overrides: Partial<JwtUserPayload> = {}): JwtUserPayload {
  return {
    sub: 'user-1',
    username: 'tester',
    roles: ['salesperson'],
    ...overrides,
  };
}

describe('ImportJobService', () => {
  const importJobRepository = createRepoMock<ImportJob>();
  const uploadsService = {
    resolveForUser: jest.fn(),
  } as unknown as UploadsService;
  const excelParserService = {
    parseFile: jest.fn(),
  } as unknown as ExcelParserService;
  const aiMappingService = {
    suggest: jest.fn(),
  } as unknown as AiMappingService;
  const fieldValidationService = {
    buildCandidateFields: jest.fn(),
    getActiveFields: jest.fn(),
    validateRow: jest.fn(),
  } as unknown as ImportFieldValidationService;
  const importErrorExcelService = {
    generate: jest.fn(),
  } as unknown as ImportErrorExcelService;
  const workOrderImportService = {
    writeOne: jest.fn(),
  } as unknown as WorkOrderImportService;
  const attachmentsService = {
    createFromBuffer: jest.fn(),
    createFromExternalLink: jest.fn(),
  } as unknown as AttachmentsService;

  const service = new ImportJobService(
    importJobRepository as unknown as Repository<ImportJob>,
    createRepoMock<Customer>() as unknown as Repository<Customer>,
    createRepoMock<CustomerAssignee>() as unknown as Repository<CustomerAssignee>,
    uploadsService,
    excelParserService,
    aiMappingService,
    fieldValidationService,
    importErrorExcelService,
    workOrderImportService,
    attachmentsService,
  );

  it('returns failed row stats and validation errors from job metadata', async () => {
    importJobRepository.findOne.mockResolvedValueOnce({
      id: 'job-1',
      userId: 'user-1',
      filePath: '/tmp/a.xlsx',
      totalRows: 10,
      successRows: 7,
      failRows: 3,
      fieldMapping: { '姓名': 'employee_name' },
      status: ImportJobStatus.FAILED,
      errorReportUrl: '/api/files/report.xlsx',
      aiModelUsed: null,
      aiPromptHash: null,
      aiMappingRaw: {
        importSummary: {
          totalRows: 10,
          successRows: 7,
          failRows: 3,
          status: 'failed',
          validationErrors: [
            { row: 2, field: 'employee_name', message: '姓名不能为空', code: 'VALIDATION_FAILED' },
            { row: 5, field: 'id_card_no', message: '身份证号格式错误', code: 'VALIDATION_FAILED' },
          ],
          warnings: [
            { row: 3, field: 'special_remark', message: '已留空，请补全', code: 'left_blank', normalizedValue: null },
          ],
        },
      },
      aiFallbackReason: null,
      createdAt: new Date('2026-05-18T00:00:00.000Z'),
      completedAt: new Date('2026-05-18T00:05:00.000Z'),
    } as unknown as ImportJob);

    const result = await service.getJob('job-1', makeUser());

    expect(result.totalRows).toBe(10);
    expect(result.successRows).toBe(7);
    expect(result.failRows).toBe(3);
    expect(result.progress).toBe(100);
    expect(result.errorReportUrl).toBe('/api/files/report.xlsx');
    expect(result.validationErrors).toHaveLength(2);
    expect(result.validationErrors?.[0].message).toContain('姓名不能为空');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings?.[0]).toMatchObject({ row: 3, field: 'special_remark', code: 'left_blank', normalizedValue: null });
    expect(result.errorMessage).toContain('姓名不能为空');
  });

  it('stores warningRows as the number of rows that have warnings', async () => {
    jest.clearAllMocks();
    const processingJob = {
      id: 'job-warning-rows',
      userId: 'user-1',
      filePath: '/tmp/import.xlsx',
      fieldMapping: { 姓名: 'employee_name' },
      status: ImportJobStatus.PROCESSING,
      aiMappingRaw: {},
      createdAt: new Date('2026-05-18T00:00:00.000Z'),
      completedAt: null,
    } as unknown as ImportJob;
    importJobRepository.findOne.mockResolvedValue(processingJob);
    (excelParserService.parseFile as jest.Mock).mockResolvedValue({
      headers: ['姓名'],
      rows: [{ 姓名: '张三' }, { 姓名: '李四' }],
    });
    (fieldValidationService.getActiveFields as jest.Mock).mockResolvedValue([]);
    (fieldValidationService.validateRow as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        rowNo: 1,
        errors: [],
        warnings: [
          { fieldCode: 'contract_template', message: '请补全', code: 'left_blank', normalizedValue: null },
          { fieldCode: 'household_address', message: '请补全', code: 'left_blank', normalizedValue: null },
        ],
        normalized: { employee_name: '张三' },
        raw: { 姓名: '张三' },
      })
      .mockResolvedValueOnce({
        ok: true,
        rowNo: 2,
        errors: [],
        warnings: [
          { fieldCode: 'special_remark', message: '请补全', code: 'left_blank', normalizedValue: null },
        ],
        normalized: { employee_name: '李四' },
        raw: { 姓名: '李四' },
      });
    (workOrderImportService.writeOne as jest.Mock)
      .mockResolvedValueOnce({ workOrderId: 'wo-1' })
      .mockResolvedValueOnce({ workOrderId: 'wo-2' });

    await service.processJob('job-warning-rows', makeUser());

    const finalUpdate = (importJobRepository.update as jest.Mock).mock.calls.find((call) => call[1]?.aiMappingRaw?.importSummary);
    expect(finalUpdate?.[1].aiMappingRaw.importSummary.warningRows).toBe(2);
    expect(finalUpdate?.[1].aiMappingRaw.warnings).toHaveLength(3);
  });

  it('expands missing field codes into field names in the failed row message', async () => {
    jest.clearAllMocks();
    const processingJob = {
      id: 'job-missing-field',
      userId: 'user-1',
      filePath: '/tmp/import.xlsx',
      fieldMapping: { 姓名: 'employee_name' },
      status: ImportJobStatus.PROCESSING,
      aiMappingRaw: {},
      createdAt: new Date('2026-05-18T00:00:00.000Z'),
      completedAt: null,
    } as unknown as ImportJob;
    importJobRepository.findOne.mockResolvedValue(processingJob);
    (excelParserService.parseFile as jest.Mock).mockResolvedValue({
      headers: ['姓名'],
      rows: [{ 姓名: '张三' }],
    });
    (fieldValidationService.getActiveFields as jest.Mock).mockResolvedValue([
      { fieldCode: 'employee_name', fieldName: '员工姓名' },
      { fieldCode: 'customer_name', fieldName: '客户名称' },
    ]);
    (fieldValidationService.validateRow as jest.Mock).mockResolvedValueOnce({
      ok: true,
      rowNo: 1,
      errors: [],
      warnings: [],
      normalized: { employee_name: '张三' },
      raw: { 姓名: '张三' },
    });
    (workOrderImportService.writeOne as jest.Mock).mockRejectedValueOnce(
      businessException(4110, HttpStatus.BAD_REQUEST, '必填字段缺失', { missing: ['employee_name', 'customer_name'] }),
    );

    await service.processJob('job-missing-field', makeUser());

    const finalUpdate = (importJobRepository.update as jest.Mock).mock.calls.find((call) => call[1]?.aiMappingRaw?.validationErrors);
    const failedRow = finalUpdate?.[1].aiMappingRaw.validationErrors?.[0];
    expect(failedRow?.message).toContain('必填字段缺失');
    expect(failedRow?.message).toContain('员工姓名');
    expect(failedRow?.message).toContain('客户名称');
    expect(failedRow?.fieldCode).toBe('employee_name');
  });

  it('passes the importing user id as ownerId when generating the error report', async () => {
    jest.clearAllMocks();
    const processingJob = {
      id: 'job-owner',
      userId: 'user-1',
      filePath: '/tmp/import.xlsx',
      fieldMapping: { 姓名: 'employee_name' },
      status: ImportJobStatus.PROCESSING,
      aiMappingRaw: {},
      createdAt: new Date('2026-06-25T00:00:00.000Z'),
      completedAt: null,
    } as unknown as ImportJob;
    importJobRepository.findOne.mockResolvedValue(processingJob);
    (excelParserService.parseFile as jest.Mock).mockResolvedValue({
      headers: ['姓名'],
      rows: [{ 姓名: '' }],
    });
    (fieldValidationService.getActiveFields as jest.Mock).mockResolvedValue([
      { fieldCode: 'employee_name', fieldName: '员工姓名' },
    ]);
    (fieldValidationService.validateRow as jest.Mock).mockResolvedValueOnce({
      ok: false,
      rowNo: 1,
      errors: [{ fieldCode: 'employee_name', reason: 'required', message: '员工姓名为必填项' }],
      warnings: [],
      normalized: {},
      raw: { 姓名: '' },
    });
    (importErrorExcelService.generate as jest.Mock).mockResolvedValue('/api/files/report.xlsx');

    await service.processJob('job-owner', makeUser({ sub: 'user-1' }));

    expect(importErrorExcelService.generate).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: 'user-1' }),
    );
  });

  it('creates external-link attachments from attachment column hyperlinks using physical row numbers', async () => {
    jest.clearAllMocks();
    (workOrderImportService.writeOne as jest.Mock).mockReset();
    (attachmentsService.createFromExternalLink as jest.Mock).mockReset();
    const processingJob = {
      id: 'job-link-attachment',
      userId: 'user-1',
      filePath: '/tmp/import.xlsx',
      fieldMapping: { Name: 'employee_name' },
      status: ImportJobStatus.PROCESSING,
      aiMappingRaw: { orderType: 'resignation' },
      createdAt: new Date('2026-07-07T00:00:00.000Z'),
      completedAt: null,
    } as unknown as ImportJob;
    importJobRepository.findOne.mockResolvedValue(processingJob);
    (excelParserService.parseFile as jest.Mock).mockResolvedValue({
      headers: ['Name', '\u9644\u4ef6'],
      rows: [{ Name: 'Alice', '\u9644\u4ef6': 'proof.pdf' }],
      meta: {
        sheetName: 'sheet1',
        totalRows: 1,
        headerRows: 1,
        rowNumbers: [4],
        attachmentLinks: [
          {
            rowIndex: 4,
            columnIndex: 1,
            header: '\u9644\u4ef6',
            text: 'proof.pdf',
            hyperlink: 'https://example.com/proof.pdf',
          },
        ],
      },
    });
    (fieldValidationService.getActiveFields as jest.Mock).mockResolvedValue([]);
    (fieldValidationService.validateRow as jest.Mock).mockResolvedValueOnce({
      ok: true,
      rowNo: 1,
      errors: [],
      warnings: [],
      normalized: { employee_name: 'Alice' },
      raw: { Name: 'Alice' },
    });
    (workOrderImportService.writeOne as jest.Mock).mockResolvedValueOnce({ workOrderId: 'wo-link' });
    (attachmentsService.createFromExternalLink as jest.Mock).mockResolvedValueOnce({ id: 'att-link-1' });

    await service.processJob('job-link-attachment', makeUser({ roles: ['admin'] }));

    expect(attachmentsService.createFromExternalLink).toHaveBeenCalledWith(
      'wo-link',
      { url: 'https://example.com/proof.pdf', originalName: 'proof.pdf' },
      'user-1',
    );
  });

});
