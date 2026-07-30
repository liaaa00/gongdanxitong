import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { promises as fs } from 'fs';
import { Repository } from 'typeorm';
import { businessException } from 'src/common/exceptions/business-exception';
import { DUPLICATE_ID_CARD_IN_MONTH } from 'src/modules/work-orders/duplicate-id-card.util';
import { Customer, CustomerAssignee, ImportJob, ImportJobStatus, OrderType } from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { isAdminRole } from 'src/common/auth/role-permissions';
import { CandidateField, ImportJobStatusVo, ImportPreviewResult, ImportValidationErrorItem, ImportWarningItem, MappingItemInput, MappingSuggestion, ParsedSheet } from './types';
import { UploadsService } from 'src/modules/uploads/uploads.service';
import { ExcelParserService } from './excel-parser.service';
import { AiMappingService } from 'src/modules/ai/ai-mapping.service';
import { ImportFieldValidationService } from './field-validation.service';
import { ImportErrorExcelService } from './error-excel.service';
import { WorkOrderImportService } from './work-order-import.service';
import { assertCanImportWorkOrder, WORK_ORDER_IMPORT_ORDER_TYPES } from './import-permissions';
import { AttachmentsService } from 'src/modules/attachments/attachments.service';
import { extractXlsxEmbeddedAttachments } from './xlsx-attachment-extractor';

interface PreviewSession {
  fileId: string;
  filePath: string;
  orderType: OrderType;
  headers: string[];
  rowCount: number;
  previewRows: Array<Record<string, unknown>>;
  suggestion: MappingSuggestion;
  availableFields: CandidateField[];
}

interface ImportFailedRow {
  rowNo: number;
  raw: Record<string, unknown>;
  fieldCode?: string;
  message: string;
  code?: string;
  existedOrderNo?: string | null;
}

@Injectable()
export class ImportJobService {
  private readonly previewSessions = new Map<string, PreviewSession>();
  private readonly logger = new Logger(ImportJobService.name);

  constructor(
    @InjectRepository(ImportJob)
    private readonly importJobRepository: Repository<ImportJob>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(CustomerAssignee)
    private readonly customerAssigneeRepository: Repository<CustomerAssignee>,
    private readonly uploadsService: UploadsService,
    private readonly excelParserService: ExcelParserService,
    private readonly aiMappingService: AiMappingService,
    private readonly fieldValidationService: ImportFieldValidationService,
    private readonly importErrorExcelService: ImportErrorExcelService,
    private readonly workOrderImportService: WorkOrderImportService,
    private readonly attachmentsService: AttachmentsService,
  ) {}

  async preview(input: {
    user: JwtUserPayload;
    fileId: string;
    orderType: OrderType;
    sampleRows?: number;
  }): Promise<ImportPreviewResult> {
    assertCanImportWorkOrder(input.user, input.orderType);
    const meta = await this.resolveImportFile(input.fileId, input.user);
    const parsed = await this.excelParserService.parseFile(meta.filePath);
    const availableFields = await this.fieldValidationService.buildCandidateFields(input.orderType);
    const rawSuggestion = await this.aiMappingService.suggest(input.orderType, parsed.headers, availableFields);
    const suggestion = this.ensureSuggestion(rawSuggestion, parsed.headers, availableFields);
    const previewRows = parsed.rows.slice(0, input.sampleRows ?? 10);

    this.previewSessions.set(input.user.sub, {
      fileId: meta.fileId,
      filePath: meta.filePath,
      orderType: input.orderType,
      headers: parsed.headers,
      rowCount: parsed.rows.length,
      previewRows,
      suggestion,
      availableFields,
    });

    return this.toPreviewResult(meta.fileId, input.orderType, parsed, previewRows, suggestion, availableFields);
  }

  async createJob(input: {
    user: JwtUserPayload;
    fileId?: string;
    orderType: OrderType;
    mapping: Record<string, string>;
    autoSubmit: boolean;
    defaults?: Record<string, unknown>;
    jobName?: string;
  }): Promise<Record<string, unknown>> {
    assertCanImportWorkOrder(input.user, input.orderType);
    const session = this.previewSessions.get(input.user.sub);
    const meta = input.fileId
      ? await this.resolveImportFile(input.fileId, input.user)
      : session
        ? await this.resolveImportFile(session.fileId, input.user)
        : this.throwMissingFile();

    const parsed = session && session.fileId === meta.fileId
      ? { headers: session.headers, rowCount: session.rowCount }
      : await this.excelParserService.parseFile(meta.filePath).then((sheet) => ({ headers: sheet.headers, rowCount: sheet.rows.length }));

    const job = await this.importJobRepository.save(this.importJobRepository.create({
      userId: input.user.sub,
      filePath: meta.filePath,
      totalRows: parsed.rowCount,
      successRows: 0,
      failRows: 0,
      fieldMapping: input.mapping,
      status: ImportJobStatus.PROCESSING,
      errorReportUrl: null,
      aiModelUsed: session?.suggestion.modelUsed ?? null,
      aiPromptHash: session?.suggestion.promptHash ?? null,
      aiMappingRaw: {
        orderType: input.orderType,
        headers: parsed.headers,
        fileId: meta.fileId,
        autoSubmit: input.autoSubmit,
        defaults: input.defaults ?? {},
        jobName: input.jobName ?? null,
      },
      aiFallbackReason: session?.suggestion.fallbackReason ?? null,
      completedAt: null,
    }));

    void setImmediate(() => {
      void this.processJob(job.id, input.user).catch(async (error: unknown) => {
        await this.importJobRepository.update(
          { id: job.id },
          {
            status: ImportJobStatus.FAILED,
            completedAt: new Date(),
            aiMappingRaw: { ...(job.aiMappingRaw ?? {}), workerError: error instanceof Error ? error.message : 'worker_failed' },
          },
        );
      });
    });

    return {
      ...this.serializeJob(job, 0, [], []),
      jobId: job.id,
      queuedAt: job.createdAt.toISOString(),
      status: ImportJobStatus.PROCESSING,
    };
  }

  async getJob(jobId: string, user: JwtUserPayload): Promise<ImportJobStatusVo> {
    const job = await this.findVisibleJob(jobId, user);
    const progress = this.progress(job);
    const validationErrors = this.readValidationErrors(job);
    const warnings = this.readWarnings(job);
    const detailMessages = this.readDetailMessages(job, validationErrors);
    return this.serializeJob(job, progress, validationErrors, warnings, detailMessages);
  }

  async cancel(jobId: string, user: JwtUserPayload): Promise<Record<string, unknown> & { progress: number }> {
    const job = await this.findVisibleJob(jobId, user);
    if (job.status !== ImportJobStatus.PROCESSING) {
      throw businessException(4401, HttpStatus.CONFLICT, 'cancel_state_invalid');
    }
    await this.importJobRepository.update({ id: job.id }, { status: ImportJobStatus.CANCELLED, completedAt: new Date() });
    const latest = await this.getJob(jobId, user);
    return {
      ...latest,
      cancelled: true,
      state: ImportJobStatus.CANCELLED,
    };
  }

  async findVisibleJob(jobId: string, user: JwtUserPayload): Promise<ImportJob> {
    const job = await this.importJobRepository.findOne({ where: { id: jobId } });
    if (!job) {
      throw businessException(4400, HttpStatus.NOT_FOUND, '导入任务不存在');
    }
    if (job.userId !== user.sub && !user.roles.includes('admin')) {
      throw businessException(5000, HttpStatus.FORBIDDEN, '无权限访问该资源');
    }
    return job;
  }

  async getErrorReport(jobId: string, user: JwtUserPayload): Promise<{ fileId: string; filePath: string; mimeType: string; fileName: string }> {
    const job = await this.findVisibleJob(jobId, user);
    if (!job.errorReportUrl) {
      throw businessException(4400, HttpStatus.NOT_FOUND, '错误报表不存在');
    }
    const fileId = this.extractFileId(job.errorReportUrl);
    const meta = await this.uploadsService.resolveForUser(fileId, user);
    return { fileId: meta.fileId, filePath: meta.filePath, mimeType: meta.mimeType, fileName: meta.fileName };
  }

  async processJob(jobId: string, user: JwtUserPayload): Promise<void> {
    const job = await this.findVisibleJob(jobId, user);
    if (job.status !== ImportJobStatus.PROCESSING) {
      return;
    }

    const parsed = await this.excelParserService.parseFile(job.filePath);
    await this.importJobRepository.update({ id: job.id }, { totalRows: parsed.rows.length, aiMappingRaw: { ...(job.aiMappingRaw ?? {}), headers: parsed.headers } });

    const orderType = this.readOrderType(job.aiMappingRaw) ?? OrderType.ONBOARDING;
    assertCanImportWorkOrder(user, orderType);
    const defaults = this.readDefaults(job.aiMappingRaw);
    const autoSubmit = this.readAutoSubmit(job.aiMappingRaw);
    const mapping = this.normalizeMapping(job.fieldMapping ?? {});
    const fields = await this.fieldValidationService.getActiveFields(orderType);
    const fieldNameMap = new Map(fields.map((field) => [field.fieldCode, field.fieldName]));
    const failRows: ImportFailedRow[] = [];
    const warnings: ImportWarningItem[] = [];
    const createdWorkOrderIds: string[] = [];

    // Resignation import attachments: embedded files plus hyperlinks in attachment columns.
    let embeddedAttachments = new Map<number, Array<{ buffer: Buffer; originalName: string; mimeType: string }>>();
    const hyperlinkAttachments = this.groupAttachmentLinksByRow(parsed);
    if (orderType === OrderType.RESIGNATION) {
      try {
        const xlsxBuffer = await fs.readFile(job.filePath);
        embeddedAttachments = await extractXlsxEmbeddedAttachments(xlsxBuffer);
        this.logger.log(`[导入附件] 从 ${job.filePath} 提取到 ${embeddedAttachments.size} 行的嵌入附件`);
        for (const [rowIdx, files] of embeddedAttachments) {
          this.logger.log(`[导入附件] 行 ${rowIdx}: ${files.length} 个文件 - ${files.map(f => f.originalName).join(', ')}`);
        }
      } catch (error) {
        this.logger.warn(`Failed to extract embedded attachments from ${job.filePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    for (const [index, raw] of parsed.rows.entries()) {
      const rowNo = index + 1;
      const current = await this.findVisibleJob(jobId, user);
      if (current.status === ImportJobStatus.CANCELLED) {
        return;
      }
      const validation = await this.fieldValidationService.validateRow({
        rowNo,
        raw,
        mapping,
        defaults,
        fields,
      });
      warnings.push(...validation.warnings.map((item) => ({
        row: rowNo,
        field: item.fieldCode,
        message: item.message,
        code: item.code,
        originalValue: item.originalValue,
        normalizedValue: item.normalizedValue,
      })));
      if (!validation.ok) {
        failRows.push({ rowNo, raw, fieldCode: validation.errors[0]?.fieldCode, message: validation.errors.map((item) => item.message).join('; ') });
        await this.importJobRepository.update({ id: job.id }, { failRows: () => 'fail_rows + 1' });
        continue;
      }

      try {
        const created = await this.writeOneRow(orderType, validation.normalized, autoSubmit, user, defaults);
        createdWorkOrderIds.push(created.workOrderId);
        await this.importJobRepository.update({ id: job.id }, { successRows: () => 'success_rows + 1' });
        // 关联嵌入附件：附件按 Excel 物理行号(0-based)提取，需用 parsed.rows 对应的物理行号取，
        // 不能直接用数组下标 index（离职模板数据从第 5 行起，下标 0 ≠ 物理行 4）
        const physicalRow = parsed.meta?.rowNumbers?.[index] ?? index;
        const attachFiles = embeddedAttachments.get(physicalRow);
        const attachLinks = hyperlinkAttachments.get(physicalRow);
        if (attachFiles?.length || attachLinks?.length) {
          this.logger.log(`[import attachment] workOrder=${created.workOrderId} row=${rowNo} physicalRow=${physicalRow} count=${(attachFiles?.length ?? 0) + (attachLinks?.length ?? 0)}`);
          for (const file of attachFiles ?? []) {
            try {
              const attachment = await this.attachmentsService.createFromBuffer(created.workOrderId, file, user.sub);
              this.logger.log(`[import attachment] file saved: ${file.originalName} (${file.mimeType}) attachmentId=${attachment.id}`);
            } catch (attachError) {
              this.logger.warn(`[import attachment] file failed: row=${rowNo} file=${file.originalName}: ${attachError instanceof Error ? attachError.message : String(attachError)}`);
            }
          }
          for (const link of attachLinks ?? []) {
            try {
              const attachment = await this.attachmentsService.createFromExternalLink(created.workOrderId, link, user.sub);
              this.logger.log(`[import attachment] external link saved: ${link.originalName} (${link.url}) attachmentId=${attachment.id}`);
            } catch (attachError) {
              this.logger.warn(`[import attachment] external link failed: row=${rowNo} url=${link.url}: ${attachError instanceof Error ? attachError.message : String(attachError)}`);
            }
          }
        } else if (embeddedAttachments.size > 0 || hyperlinkAttachments.size > 0) {
          this.logger.debug(`[import attachment] no attachment: workOrder=${created.workOrderId} row=${rowNo} physicalRow=${physicalRow}`);
        }
      } catch (error) {
        const rowError = this.toRowError(error, fieldNameMap);
        failRows.push({ rowNo, raw, fieldCode: rowError.fieldCode, message: rowError.message, code: rowError.code, existedOrderNo: rowError.existedOrderNo });
        await this.importJobRepository.update({ id: job.id }, { failRows: () => 'fail_rows + 1' });
      }
    }

    const errorReportUrl = failRows.length > 0
      ? await this.buildErrorReport(job.id, parsed.headers, failRows, user.sub)
      : null;

    const latest = await this.findVisibleJob(jobId, user);
    if (latest.status === ImportJobStatus.CANCELLED) {
      return;
    }

    const status = createdWorkOrderIds.length === 0
      ? ImportJobStatus.FAILED
      : failRows.length > 0
        ? ImportJobStatus.PARTIAL
        : ImportJobStatus.COMPLETED;
    const warningRows = new Set(warnings.map((item) => item.row)).size;

    await this.importJobRepository.update(
      { id: job.id },
      {
        status,
        errorReportUrl,
        completedAt: new Date(),
        aiMappingRaw: {
          ...(job.aiMappingRaw ?? {}),
          importSummary: {
            totalRows: parsed.rows.length,
            successRows: createdWorkOrderIds.length,
            failRows: failRows.length,
            warningRows,
            status,
            warnings,
          },
          validationErrors: failRows,
          warnings,
        },
      },
    );
  }

  private groupAttachmentLinksByRow(parsed: ParsedSheet): Map<number, Array<{ url: string; originalName: string }>> {
    const grouped = new Map<number, Array<{ url: string; originalName: string }>>();
    for (const link of parsed.meta?.attachmentLinks ?? []) {
      const url = link.hyperlink.trim();
      if (!/^https?:\/\//i.test(url)) {
        continue;
      }
      const list = grouped.get(link.rowIndex) ?? [];
      list.push({ url, originalName: link.text || url });
      grouped.set(link.rowIndex, list);
    }
    return grouped;
  }

  private ensureSuggestion(
    suggestion: MappingSuggestion,
    headers: string[],
    availableFields: CandidateField[],
  ): MappingSuggestion {
    if (Object.keys(suggestion.suggestion).length > 0) {
      return suggestion;
    }

    if (!headers.every((header) => this.isPlaceholderHeader(header))) {
      return suggestion;
    }

    const fallback = this.buildSequentialSuggestion(headers, availableFields);
    if (Object.keys(fallback.suggestion).length > 0) {
      return fallback;
    }

    return suggestion;
  }

  private isPlaceholderHeader(header: string): boolean {
    return /^__col_\d+__$/.test(header.trim());
  }

  private buildSequentialSuggestion(headers: string[], availableFields: CandidateField[]): MappingSuggestion {
    const suggestion: Record<string, string> = {};
    const confidence: Record<string, number> = {};
    const unmatched: string[] = [];

    headers.forEach((header, index) => {
      const field = availableFields[index];
      if (!field) {
        unmatched.push(header);
        return;
      }
      suggestion[header] = field.fieldCode;
      confidence[header] = 0.3;
    });

    return {
      suggestion,
      confidence,
      unmatched,
      missingRequired: availableFields.filter((field) => field.required && !Object.values(suggestion).includes(field.fieldCode)).map((field) => field.fieldCode),
      modelUsed: 'fallback:positional',
      promptHash: this.hashHeaders(headers),
      localMatchedCount: 0,
      llmMatchedCount: 0,
      fallbackReason: 'provider_error',
    };
  }

  private async writeOneRow(
    orderType: OrderType,
    normalized: Record<string, unknown>,
    autoSubmit: boolean,
    user: JwtUserPayload,
    defaults?: Record<string, unknown>,
  ): Promise<{ workOrderId: string }> {
    return this.workOrderImportService.writeOne({ orderType, normalized, autoSubmit, user, defaults });
  }

  private async buildErrorReport(jobId: string, headers: string[], errors: Array<{ rowNo: number; raw: Record<string, unknown>; fieldCode?: string; message: string; code?: string; existedOrderNo?: string | null }>, ownerId?: string): Promise<string | null> {
    const rows = errors.map((item) => ({ rowNo: item.rowNo, raw: item.raw, fieldCode: item.fieldCode, message: item.message, code: item.code, existedOrderNo: item.existedOrderNo }));
    const meta = await this.importErrorExcelService.generate({ jobId, headers, errors: rows, ownerId });
    return meta;
  }

  private serializeJob(
    job: ImportJob,
    progress: number,
    validationErrors: ImportValidationErrorItem[],
    warnings: ImportWarningItem[] = [],
    detailMessages: string[] = [],
  ): ImportJobStatusVo {
    const status = this.normalizeImportStatus(job.status, job.failRows > 0 && job.successRows > 0);
    return {
      id: job.id,
      status,
      totalRows: job.totalRows,
      successRows: job.successRows,
      failRows: job.failRows,
      progress,
      fieldMapping: job.fieldMapping,
      errorReportUrl: job.errorReportUrl,
      validationErrors,
      warnings,
      errorMessage: detailMessages[0] ?? (job.errorReportUrl && job.failRows > 0 ? `failed_rows=${job.failRows}` : null),
      startedAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
    };
  }

  private normalizeImportStatus(status: ImportJobStatus, partial = false): ImportJobStatusVo['status'] {
    if (partial && status === ImportJobStatus.FAILED) {
      return 'partially_failed';
    }
    return status === ImportJobStatus.PARTIAL ? 'partially_failed' : status;
  }

  private readValidationErrors(job: ImportJob): ImportValidationErrorItem[] {
    const rawErrors = this.readJobArray(job, 'validationErrors');
    if (rawErrors.length > 0) {
      return rawErrors
        .map((item) => this.toValidationError(item))
        .filter((item): item is ImportValidationErrorItem => item !== null);
    }
    const rawSummary = this.readJobRecord(job, 'importSummary');
    const summaryErrors = Array.isArray(rawSummary?.validationErrors) ? rawSummary.validationErrors : [];
    return summaryErrors.map((item: unknown) => this.toValidationError(item)).filter((item): item is ImportValidationErrorItem => item !== null);
  }

  private readWarnings(job: ImportJob): ImportWarningItem[] {
    const rawWarnings = this.readJobArray(job, 'warnings');
    if (rawWarnings.length > 0) {
      return rawWarnings
        .map((item) => this.toWarning(item))
        .filter((item): item is ImportWarningItem => item !== null);
    }
    const rawSummary = this.readJobRecord(job, 'importSummary');
    const summaryWarnings = Array.isArray(rawSummary?.warnings) ? rawSummary.warnings : [];
    return summaryWarnings.map((item: unknown) => this.toWarning(item)).filter((item): item is ImportWarningItem => item !== null);
  }

  private readDetailMessages(job: ImportJob, validationErrors: ImportValidationErrorItem[]): string[] {
    const messages: string[] = [];
    const push = (value: unknown) => {
      if (typeof value === 'string' && value.trim().length > 0) {
        messages.push(value.trim());
      }
    };

    validationErrors.forEach((item) => push(item.message));
    const raw = job.aiMappingRaw;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      push((raw as Record<string, unknown>).workerError);
      push((raw as Record<string, unknown>).errorMessage);
      push((raw as Record<string, unknown>).message);
      const summary = (raw as Record<string, unknown>).importSummary;
      if (summary && typeof summary === 'object' && !Array.isArray(summary)) {
        push((summary as Record<string, unknown>).errorMessage);
      }
    }
    return [...new Set(messages)];
  }

  private readJobRecord(job: ImportJob, key: string): Record<string, unknown> | null {
    const raw = job.aiMappingRaw;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }
    const value = (raw as Record<string, unknown>)[key];
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  }

  private readJobArray(job: ImportJob, key: string): unknown[] {
    const raw = job.aiMappingRaw;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return [];
    }
    const value = (raw as Record<string, unknown>)[key];
    return Array.isArray(value) ? value : [];
  }

  private toValidationError(item: unknown): ImportValidationErrorItem | null {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return null;
    }
    const row = Number((item as Record<string, unknown>).row ?? (item as Record<string, unknown>).rowNo);
    const field = String((item as Record<string, unknown>).field ?? (item as Record<string, unknown>).fieldCode ?? '').trim();
    const message = String((item as Record<string, unknown>).message ?? '').trim();
    if (!Number.isFinite(row) || row <= 0 || !message) {
      return null;
    }
    return {
      row: Math.trunc(row),
      field: field || void 0,
      message,
      code: typeof (item as Record<string, unknown>).code === 'string' ? String((item as Record<string, unknown>).code) : undefined,
      existedOrderNo: typeof (item as Record<string, unknown>).existedOrderNo === 'string'
        ? String((item as Record<string, unknown>).existedOrderNo)
        : null,
    };
  }

  private toWarning(item: unknown): ImportWarningItem | null {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return null;
    }
    const row = Number((item as Record<string, unknown>).row ?? (item as Record<string, unknown>).rowNo);
    const field = String((item as Record<string, unknown>).field ?? (item as Record<string, unknown>).fieldCode ?? '').trim();
    const message = String((item as Record<string, unknown>).message ?? '').trim();
    if (!Number.isFinite(row) || row <= 0 || !field || !message) {
      return null;
    }
    return {
      row: Math.trunc(row),
      field,
      message,
      code: typeof (item as Record<string, unknown>).code === 'string' ? String((item as Record<string, unknown>).code) : undefined,
      originalValue: (item as Record<string, unknown>).originalValue,
      normalizedValue: (item as Record<string, unknown>).normalizedValue,
    };
  }

  private toRowError(
    error: unknown,
    fieldNameMap?: Map<string, string>,
  ): { message: string; code?: string; existedOrderNo?: string | null; fieldCode?: string } {
    const response = error && typeof error === 'object' && 'getResponse' in error
      ? (error as { getResponse: () => unknown }).getResponse()
      : null;
    if (response && typeof response === 'object') {
      const body = response as { message?: unknown; details?: Record<string, unknown> };
      const detailsCode = typeof body.details?.code === 'string' ? body.details.code : undefined;
      if (detailsCode === DUPLICATE_ID_CARD_IN_MONTH || body.message === DUPLICATE_ID_CARD_IN_MONTH) {
        return {
          message: DUPLICATE_ID_CARD_IN_MONTH,
          code: DUPLICATE_ID_CARD_IN_MONTH,
          existedOrderNo: typeof body.details?.existedOrderNo === 'string' ? body.details.existedOrderNo : null,
        };
      }
      const baseMessage = typeof body.message === 'string' ? body.message : 'import row failed';
      const missingCodes = this.extractMissingFieldCodes(body.details);
      if (missingCodes.length > 0) {
        const labels = missingCodes.map((code) => fieldNameMap?.get(code) ?? code);
        return {
          message: `${baseMessage}：${labels.join('、')}`,
          code: detailsCode,
          fieldCode: missingCodes[0],
        };
      }
      return { message: baseMessage, code: detailsCode };
    }
    return { message: error instanceof Error ? error.message : 'import row failed' };
  }

  private extractMissingFieldCodes(details?: Record<string, unknown>): string[] {
    if (!details) {
      return [];
    }
    const missing = details.missing;
    if (Array.isArray(missing)) {
      return missing.filter((item): item is string => typeof item === 'string');
    }
    if (typeof details.fieldCode === 'string') {
      return [details.fieldCode];
    }
    return [];
  }

  private progress(job: ImportJob): number {
    if (job.totalRows <= 0) {
      return 0;
    }
    return Math.min(100, Math.round(((job.successRows + job.failRows) / job.totalRows) * 100));
  }

  private toPreviewResult(
    fileId: string,
    orderType: OrderType,
    parsed: ParsedSheet,
    previewRows: Array<Record<string, unknown>>,
    suggestion: MappingSuggestion,
    availableFields: CandidateField[],
  ): ImportPreviewResult {
    // 占位符列(空列 + 模板结构列「字段名」「附件」)不是数据字段，
    // 不进入映射表也不计入未匹配，避免误报「表头未自动匹配」黄条。
    const mappableHeaders = parsed.headers.filter((header) => !this.isPlaceholderHeader(header));
    const unmatched = suggestion.unmatched.filter((header) => !this.isPlaceholderHeader(header));
    return {
      fileId,
      orderType,
      headers: parsed.headers,
      rowCount: parsed.rows.length,
      preview: previewRows,
      suggestion: suggestion.suggestion,
      confidence: suggestion.confidence,
      unmatched,
      missingRequired: suggestion.missingRequired,
      availableFields,
      modelUsed: suggestion.modelUsed,
      localMatchedCount: suggestion.localMatchedCount,
      llmMatchedCount: suggestion.llmMatchedCount,
      fallbackReason: suggestion.fallbackReason,
      mapping: mappableHeaders.map((header) => ({
        excelColumn: header,
        systemFieldCode: suggestion.suggestion[header] ?? '',
        systemFieldName: availableFields.find((field) => field.fieldCode === suggestion.suggestion[header])?.fieldName ?? '',
        confidence: suggestion.confidence[header],
      })),
      suggestedMapping: suggestion.suggestion,
      previewRows,
      totalRows: parsed.rows.length,
      unmatchedHeaders: unmatched,
    } as ImportPreviewResult;
  }

  private normalizeMapping(mapping: Record<string, string>): MappingItemInput[] {
    return Object.entries(mapping)
      .filter(([, fieldCode]) => typeof fieldCode === 'string' && fieldCode.trim().length > 0)
      .map(([header, fieldCode]) => ({ header, fieldCode }));
  }

  private readOrderType(raw: unknown): OrderType | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }
    const value = (raw as Record<string, unknown>).orderType;
    return WORK_ORDER_IMPORT_ORDER_TYPES.includes(value as OrderType)
      ? value as OrderType
      : null;
  }

  private readDefaults(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {};
    }
    const value = (raw as Record<string, unknown>).defaults;
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  private readAutoSubmit(raw: unknown): boolean {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return true;
    }
    const value = (raw as Record<string, unknown>).autoSubmit;
    return typeof value === 'boolean' ? value : true;
  }

  private requireFileId(fileId?: string): string {
    if (!fileId) {
      throw businessException(4400, HttpStatus.BAD_REQUEST, 'fileId missing');
    }
    return fileId;
  }

  private async resolveImportFile(
    fileId: string | undefined,
    user: JwtUserPayload,
  ) {
    const id = this.requireFileId(fileId);
    try {
      return await this.uploadsService.resolveForUser(id, user);
    } catch (error) {
      throw businessException(
        4400,
        HttpStatus.BAD_REQUEST,
        '上传文件已过期或不存在，请重新上传 Excel 后重试',
      );
    }
  }

  private extractFileId(url: string): string {
    return url.split('/').pop() ?? url;
  }

  private throwMissingFile(): never {
    throw businessException(4400, HttpStatus.BAD_REQUEST, 'import file missing');
  }

  private hashHeaders(headers: string[]): string {
    return headers.join('|');
  }
}
