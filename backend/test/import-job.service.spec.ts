import { Repository } from 'typeorm';
import { Customer, CustomerAssignee, ImportJob, ImportJobStatus } from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { ImportJobService } from 'src/modules/imports/import-job.service';
import { ImportFieldValidationService } from 'src/modules/imports/field-validation.service';
import { ImportErrorExcelService } from 'src/modules/imports/error-excel.service';
import { WorkOrderImportService } from 'src/modules/imports/work-order-import.service';
import { UploadsService } from 'src/modules/uploads/uploads.service';
import { ExcelParserService } from 'src/modules/imports/excel-parser.service';
import { AiMappingService } from 'src/modules/ai/ai-mapping.service';

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
});
