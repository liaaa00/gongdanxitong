import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Workbook, Worksheet } from 'exceljs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { In, Repository } from 'typeorm';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { toPageResult } from 'src/common/types/pagination.types';
import { DispatchedOrder, ExportTemplate, FieldConfig, OperationLog, OrderAttachment } from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { DispatchedOrderExportFile, DispatchedOrderExportResult } from 'src/modules/dispatched-orders/dispatched-order.types';
import { fallbackBusinessLabel } from 'src/modules/notifications/notification-display.util';
import { UploadService } from 'src/modules/upload/upload.service';

interface ExportColumn {
  fieldCode: string;
  title: string;
  order: number;
}

interface AttachmentLink {
  name: string;
  url: string;
}

interface RichExportColumn {
  kind: 'field' | 'const' | 'sameAs' | 'formula';
  valueCode: string;
  constValue: string;
  formulaTemplate: string;
  numFmt: string;
  dropdownOptions: string[];
  headers: string[];
  publicTitle: string;
  order: number;
}

export interface ExportTemplateView {
  id: string;
  templateName: string;
  moduleCode: string;
  fieldList: Array<Record<string, unknown>>;
  createdBy: string;
  isShared: boolean;
  signPlatform: string | null;
  createdAt: Date;
}

@Injectable()
export class ExportTemplatesService {
  constructor(
    @InjectRepository(ExportTemplate)
    private readonly repository: Repository<ExportTemplate>,
    @InjectRepository(DispatchedOrder)
    private readonly dispatchedOrderRepository: Repository<DispatchedOrder>,
    @InjectRepository(OperationLog)
    private readonly operationLogRepository: Repository<OperationLog>,
    @InjectRepository(FieldConfig)
    private readonly fieldConfigRepository: Repository<FieldConfig>,
    @InjectRepository(OrderAttachment)
    private readonly attachmentRepository: Repository<OrderAttachment>,
    private readonly uploadService: UploadService,
  ) {}

  async list(query: PaginationQueryDto & { moduleCode?: string }, currentUserId: string) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.repository
      .createQueryBuilder('template')
      .where('(template.createdBy = :userId OR template.isShared = true)', { userId: currentUserId });
    if (query.moduleCode) qb.andWhere('template.moduleCode = :moduleCode', { moduleCode: query.moduleCode });
    if (query.keyword) qb.andWhere('template.templateName ILIKE :keyword', { keyword: `%${query.keyword}%` });
    qb.orderBy('template.createdAt', 'DESC');
    const [rows, total] = await qb.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const fieldNameMap = await this.loadFieldNameMap();
    return toPageResult(page, pageSize, total, rows.map((row) => this.toTemplateView(row, fieldNameMap)));
  }

  async get(id: string): Promise<ExportTemplateView> {
    const row = await this.loadTemplate(id);
    return this.toTemplateView(row, await this.loadFieldNameMap());
  }

  private async loadTemplate(id: string): Promise<ExportTemplate> {
    const row = await this.repository.findOne({ where: { id } });
    if (!row) throw new NotFoundException('导出模板未找到');
    return row;
  }

  async create(input: {
    templateName: string;
    moduleCode: string;
    fieldList: Array<Record<string, unknown>>;
    createdBy: string;
    isShared?: boolean;
    signPlatform?: string | null;
  }): Promise<ExportTemplateView> {
    const fieldNameMap = await this.loadFieldNameMap();
    const saved = await this.repository.save(this.repository.create({
      templateName: input.templateName,
      moduleCode: input.moduleCode,
      fieldList: this.normalizeFieldList(input.fieldList, fieldNameMap),
      createdBy: input.createdBy,
      isShared: input.isShared ?? false,
      signPlatform: this.normalizeSignPlatform(input.signPlatform),
    }));
    return this.toTemplateView(saved, fieldNameMap);
  }

  async update(id: string, input: Partial<{ templateName: string; moduleCode: string; fieldList: Array<Record<string, unknown>>; isShared: boolean; signPlatform: string | null }>): Promise<ExportTemplateView> {
    const row = await this.loadTemplate(id);
    const fieldNameMap = await this.loadFieldNameMap();
    Object.assign(
      row,
      input,
      input.fieldList ? { fieldList: this.normalizeFieldList(input.fieldList, fieldNameMap) } : {},
      input.signPlatform !== undefined ? { signPlatform: this.normalizeSignPlatform(input.signPlatform) } : {},
    );
    return this.toTemplateView(await this.repository.save(row), fieldNameMap);
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const row = await this.loadTemplate(id);
    await this.repository.remove(row);
    return { success: true };
  }

  async previewApply(templateId: string, dispatchedOrderIds: string[]): Promise<DispatchedOrderExportResult> {
    const template = await this.loadTemplate(templateId);
    const orders = await this.loadOrders(dispatchedOrderIds, template.moduleCode);
    return this.buildResult(template, orders, await this.loadFieldNameMap());
  }

  async apply(templateId: string, dispatchedOrderIds: string[], user: JwtUserPayload): Promise<DispatchedOrderExportResult> {
    const template = await this.loadTemplate(templateId);
    const orders = await this.loadOrders(dispatchedOrderIds, template.moduleCode);
    return this.applyTemplateToOrders(template, orders, dispatchedOrderIds, user, 'export_template');
  }

  async exportSingleDispatchedOrder(dispatchedOrderId: string, templateId: string | undefined, user: JwtUserPayload): Promise<DispatchedOrderExportResult> {
    const order = await this.dispatchedOrderRepository.findOne({
      where: { id: dispatchedOrderId },
      relations: { parentOrder: { creator: true }, handler: true },
    });
    if (!order) throw new NotFoundException('子工单未找到');
    const template = templateId
      ? await this.loadTemplate(templateId)
      : await this.resolveDefaultTemplate(order.moduleCode, order.visibleFields ?? [], this.resolveTemplateRouteSignPlatform(order));
    if (template.moduleCode !== order.moduleCode) throw new NotFoundException('该模块下未找到导出模板');
    return this.applyTemplateToOrders(template, [order], [dispatchedOrderId], user, 'dispatched_order');
  }

  async exportDispatchedOrdersAuto(dispatchedOrderIds: string[], templateId: string | undefined, user: JwtUserPayload): Promise<DispatchedOrderExportResult> {
    const ids = Array.from(new Set(dispatchedOrderIds));
    if (ids.length === 0) throw new NotFoundException('未选择子工单');
    if (templateId) return this.apply(templateId, ids, user);

    const orders = await this.loadOrdersByIds(ids);
    const fieldNameMap = await this.loadFieldNameMap();
    const fieldOptionsMap = await this.loadFieldOptionsMap();
    let rowCount = 0;
    const grouped = new Map<string, { moduleCode: string; signPlatform: string | null; orders: DispatchedOrder[] }>();
    for (const order of orders) {
      const moduleCode = order.moduleCode;
      const signPlatform = this.resolveTemplateRouteSignPlatform(order);
      const groupKey = `${moduleCode}::${signPlatform ?? ''}`;
      const group = grouped.get(groupKey) ?? { moduleCode, signPlatform, orders: [] };
      group.orders.push(order);
      grouped.set(groupKey, group);
    }

    // 每个分组（模块+电子签平台）各自生成一个独立文件，前端逐个下载，互不合并。
    const files: DispatchedOrderExportFile[] = [];
    for (const { moduleCode, signPlatform, orders: moduleOrders } of grouped.values()) {
      let workbook = new Workbook();
      const usedSheetNames = new Set<string>();
      const visibleFields = Array.from(new Set(moduleOrders.flatMap((order) => order.visibleFields ?? [])));
      const template = await this.resolveDefaultTemplate(moduleCode, visibleFields, signPlatform);
      const result = this.buildResult(template, moduleOrders, fieldNameMap);
      rowCount += result.rowCount ?? result.rows.length;
      const standardWorkbook = await this.tryBuildStandardTemplateWorkbook(template, moduleOrders);
      const richCols = this.resolveRichColumns(template, fieldNameMap, fieldOptionsMap);
      const needsAttachments = richCols.some((col) => col.valueCode === 'attachments_summary');
      const attachmentSummaries = needsAttachments ? await this.loadAttachmentSummaries(moduleOrders) : undefined;
      if (standardWorkbook) {
        workbook = await this.appendWorkbookSheets(workbook, standardWorkbook, usedSheetNames, template.templateName || moduleCode);
      } else {
        this.writeWorksheet(
          workbook,
          this.uniqueSheetName(template.templateName || moduleCode, usedSheetNames),
          richCols,
          moduleOrders,
          template.signPlatform ?? signPlatform ?? null,
          attachmentSummaries,
        );
      }
      const buffer = await this.writeWorkbookBuffer(workbook);
      const platformLabel = signPlatform ? `-${signPlatform}` : '';
      const meta = await this.uploadService.saveBuffer({
        kind: 'excel',
        buffer,
        originalName: `${template.templateName || moduleCode}${platformLabel}-${Date.now()}.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      files.push({
        fileId: meta.fileId,
        fileName: meta.originalName,
        downloadUrl: `/api/files/${meta.fileId}`,
        moduleCode,
        signPlatform,
        count: moduleOrders.length,
      });
    }

    const exportGroups = files.map(({ moduleCode, signPlatform, count }) => ({ moduleCode, signPlatform, count }));
    const moduleCodes = Array.from(new Set(exportGroups.map((group) => group.moduleCode)));
    const primary = files[0];
    await this.operationLogRepository.save(this.operationLogRepository.create({
      entityType: 'dispatched_order',
      entityId: ids[0],
      userId: user.sub,
      actionType: 'batch_export_auto_template',
      beforeData: null,
      afterData: { dispatchedOrderIds: ids, fileIds: files.map((f) => f.fileId), rowCount, moduleCodes, exportGroups },
      ipAddress: null,
    }));
    return {
      templateId: null,
      templateName: '子工单批量导出',
      moduleCode: moduleCodes.length === 1 ? moduleCodes[0] : 'mixed',
      columns: [],
      rows: [],
      rowCount,
      fileId: primary?.fileId,
      fileName: primary?.fileName,
      downloadUrl: primary?.downloadUrl,
      files,
    };
  }

  private async applyTemplateToOrders(
    template: ExportTemplate,
    orders: DispatchedOrder[],
    dispatchedOrderIds: string[],
    user: JwtUserPayload,
    entityType: 'export_template' | 'dispatched_order',
  ): Promise<DispatchedOrderExportResult> {
    const fieldNameMap = await this.loadFieldNameMap();
    const fieldOptionsMap = await this.loadFieldOptionsMap();
    const exportTemplate = { ...template, fieldList: this.prepareExportFieldList(template.fieldList ?? []) } as ExportTemplate;
    const result = this.buildResult(exportTemplate, orders, fieldNameMap);
    const richCols = this.resolveRichColumns(exportTemplate, fieldNameMap, fieldOptionsMap);
    const needsAttachments = richCols.some((col) => col.valueCode === 'attachments_summary');
    const attachmentSummaries = needsAttachments ? await this.loadAttachmentSummaries(orders) : undefined;
    const workbook = await this.tryBuildStandardTemplateWorkbook(exportTemplate, orders) ?? new Workbook();
    if (workbook.worksheets.length === 0) {
      this.writeWorksheet(workbook, exportTemplate.templateName, richCols, orders, exportTemplate.signPlatform ?? null, attachmentSummaries);
    }
    const buffer = await this.writeWorkbookBuffer(workbook);
    const meta = await this.uploadService.saveBuffer({
      kind: 'excel',
      buffer,
      originalName: `${template.templateName}-${Date.now()}.xlsx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await this.operationLogRepository.save(this.operationLogRepository.create({
      entityType,
      entityId: template.id || dispatchedOrderIds[0],
      userId: user.sub,
      actionType: 'apply_export_template',
      beforeData: null,
      afterData: { templateId: template.id || null, dispatchedOrderIds, fileId: meta.fileId, rowCount: result.rowCount },
      ipAddress: null,
    }));
    return { ...result, fileId: meta.fileId, fileName: meta.originalName, downloadUrl: `/api/files/${meta.fileId}` };
  }

  private async loadOrdersByIds(ids: string[]): Promise<DispatchedOrder[]> {
    if (ids.length === 0) return [];
    const orders = await this.dispatchedOrderRepository
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.parentOrder', 'w')
      .leftJoinAndSelect('w.creator', 'creator')
      .leftJoinAndSelect('d.handler', 'h')
      .where('d.id IN (:...ids)', { ids })
      .orderBy('d.created_at', 'ASC')
      .getMany();
    if (orders.length === 0) throw new NotFoundException('未匹配到子工单');
    return orders;
  }

  private uniqueSheetName(name: string, used: Set<string>): string {
    const normalized = name.replace(/[\\/*?:\[\]]/g, '').trim() || 'Sheet';
    const base = normalized.slice(0, 28);
    let candidate = base;
    let index = 1;
    while (used.has(candidate)) {
      candidate = `${base.slice(0, 25)}-${index}`;
      index += 1;
    }
    used.add(candidate);
    return candidate;
  }

  private async loadOrders(ids: string[], moduleCode: string): Promise<DispatchedOrder[]> {
    if (ids.length === 0) return [];
    const orders = await this.dispatchedOrderRepository
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.parentOrder', 'w')
      .leftJoinAndSelect('w.creator', 'creator')
      .leftJoinAndSelect('d.handler', 'h')
      .where('d.id IN (:...ids)', { ids })
      .andWhere('d.module_code = :moduleCode', { moduleCode })
      .orderBy('d.created_at', 'ASC')
      .getMany();
    if (orders.length === 0) throw new NotFoundException('该模板模块下未匹配到子工单');
    return orders;
  }

  private async resolveDefaultTemplate(moduleCode: string, visibleFields: string[], signPlatform?: string | null): Promise<ExportTemplate> {
    const platform = this.normalizeSignPlatform(signPlatform);
    let shared: ExportTemplate | null = null;
    if (moduleCode === 'contract') {
      if (!platform) {
        throw new BadRequestException('劳动合同子工单缺少电子签平台，无法自动匹配速创/E签宝导出模板');
      }
      shared = await this.repository.findOne({ where: { moduleCode, isShared: true, signPlatform: platform }, order: { createdAt: 'DESC' } });
      if (!shared) {
        throw new BadRequestException(`未找到电子签平台“${platform}”对应的劳动合同导出模板，请先重启后端或执行 seed 同步后台导出模板配置`);
      }
    } else {
      shared = await this.repository.findOne({ where: { moduleCode, isShared: true }, order: { createdAt: 'DESC' } });
    }
    if (shared) {
      shared.fieldList = this.prepareExportFieldList(shared.fieldList);
      return shared;
    }
    const fieldList = this.prepareExportFieldList(visibleFields.map((fieldCode, order) => ({ fieldCode, order: order + 10 })));
    return this.repository.create({ id: '', templateName: `${moduleCode}-default`, moduleCode, fieldList, createdBy: '', isShared: false, signPlatform: null });
  }

  private readonly exportExcludedFieldCodes = new Set(['order_no', 'employee_id_card']);

  private prepareExportFieldList(fieldList: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    const normalized = fieldList
      .filter((item) => !this.exportExcludedFieldCodes.has(this.resolveFieldCode(item)))
      .map((item, index) => ({ ...item, order: this.readNumber(item.order) ?? index + 10 }));
    const hasCreator = normalized.some((item) => this.resolveFieldCode(item) === 'created_by_name');
    if (hasCreator) return normalized;
    const maxOrder = normalized.reduce((max, item, index) => Math.max(max, this.readNumber(item.order) ?? index + 1), 0);
    return [
      ...normalized,
      { fieldCode: 'created_by_name', alias: '发起人', header: ['发起人'], order: maxOrder + 1 },
    ];
  }

  private ensureImportIdentityColumns(fieldList: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    return this.prepareExportFieldList(fieldList);
  }

  private buildResult(
    template: ExportTemplate,
    orders: DispatchedOrder[],
    fieldNameMap: Map<string, string>,
  ): DispatchedOrderExportResult {
    const exportTemplate = { ...template, fieldList: this.prepareExportFieldList(template.fieldList ?? []) } as ExportTemplate;
    const rich = this.resolveRichColumns(exportTemplate, fieldNameMap);
    const columns = rich.map((column) => ({ fieldCode: column.valueCode, title: column.publicTitle, order: column.order }));
    const rows = orders.map((order) => {
      const row: Record<string, unknown> = {};
      for (const column of rich) row[column.publicTitle] = this.renderRichValue(column, order);
      return row;
    });
    return { templateId: template.id || null, templateName: template.templateName, moduleCode: template.moduleCode, columns, rows, rowCount: rows.length };
  }

  private resolveRichColumns(
    template: ExportTemplate,
    fieldNameMap: Map<string, string>,
    fieldOptionsMap?: Map<string, string[]>,
  ): RichExportColumn[] {
    return template.fieldList
      .map((item, index) => {
        const order = this.readNumber(item.order) ?? index;
        const hasConst = Object.prototype.hasOwnProperty.call(item, 'const');
        const sameAsCode = this.readString(item.sameAs);
        const formulaTemplate = this.readString(item.formula);
        const fieldCode = this.resolveFieldCode(item);
        let kind: RichExportColumn['kind'] = 'field';
        let valueCode = fieldCode;
        let constValue = '';
        if (formulaTemplate) {
          kind = 'formula';
          valueCode = fieldCode;
        } else if (hasConst && !fieldCode) {
          kind = 'const';
          constValue = this.readString(item.const) ?? '';
        } else if (sameAsCode) {
          kind = 'sameAs';
          valueCode = sameAsCode;
        }
        const numFmt = this.readString(item.numFmt) ?? '';
        const dropdownOptions = this.resolveDropdownOptions(item, kind, valueCode, fieldOptionsMap);
        const rawTitle = this.readString(item.alias) ?? this.readString(item.title) ?? '';
        const primaryTitle = kind === 'const'
          ? (rawTitle || constValue)
          : (this.shouldUseFallbackTitle(rawTitle, valueCode) ? this.resolveFieldTitle(valueCode, fieldNameMap) : rawTitle);
        const explicitHeaders = this.toHeaderArray(item.header);
        const headers = explicitHeaders.length > 0 ? explicitHeaders : [primaryTitle];
        const publicTitle = headers.find((header) => header.length > 0) ?? primaryTitle;
        return { kind, valueCode, constValue, formulaTemplate: formulaTemplate ?? '', numFmt, dropdownOptions, headers, publicTitle, order };
      })
      .filter((column) => column.kind === 'const' || column.valueCode.length > 0)
      .sort((left, right) => left.order - right.order);
  }

  // 下拉选项来源优先级：① 列配置显式 options/dropdownOptions ② 字段配置 FieldConfig.dropdownOptions。
  // 公式列、const 列不加下拉；无权威 options 的列不加下拉（不猜平台私有选项）。
  private resolveDropdownOptions(
    item: Record<string, unknown>,
    kind: RichExportColumn['kind'],
    valueCode: string,
    fieldOptionsMap?: Map<string, string[]>,
  ): string[] {
    if (kind === 'formula' || kind === 'const') return [];
    const explicit = this.toOptionArray(item.options) ?? this.toOptionArray(item.dropdownOptions);
    if (explicit) return explicit;
    if (valueCode && fieldOptionsMap) {
      const fromField = fieldOptionsMap.get(valueCode);
      if (fromField && fromField.length > 0) return fromField;
    }
    return [];
  }

  private toOptionArray(value: unknown): string[] | null {
    if (!Array.isArray(value)) return null;
    const options = value
      .map((entry) => (entry === null || entry === undefined ? '' : String(entry)))
      .filter((entry) => entry.length > 0);
    return options.length > 0 ? options : null;
  }

  // 附件下载基址：Excel 打开后点击需要绝对 URL；相对链接在部分 Excel 中不可点。
  private attachmentFileBaseUrl(): string {
    return (process.env.EXPORT_FILE_BASE_URL ?? 'http://localhost:3000').trim().replace(/\/+$/, '');
  }

  private async loadAttachmentSummaries(orders: DispatchedOrder[]): Promise<Map<string, AttachmentLink[]>> {
    const workOrderIds = orders.map((o) => o.parentOrder?.id).filter((id): id is string => !!id);
    if (workOrderIds.length === 0) return new Map();
    const rows = await this.attachmentRepository.find({
      where: { workOrderId: In(workOrderIds), bizPurpose: 'resignation_material' },
      select: ['workOrderId', 'originalName', 'fileId'],
    });
    const base = this.attachmentFileBaseUrl();
    const map = new Map<string, AttachmentLink[]>();
    for (const row of rows) {
      const list = map.get(row.workOrderId) ?? [];
      // 附件含身份证等敏感 PII，下载端点受鉴权保护；Excel 超链接带不了 Authorization 头，
      // 故使用带 HMAC 签名的临时下载 URL（默认 7 天有效），既可点击又不裸公开。
      list.push({ name: row.originalName, url: this.uploadService.buildSignedDownloadUrl(base, row.fileId) });
      map.set(row.workOrderId, list);
    }
    return map;
  }

  private renderRichValue(column: RichExportColumn, order: DispatchedOrder, attachmentSummaries?: Map<string, AttachmentLink[]>): unknown {
    // 附件字段：兼容 attachments_summary、attachments、附件 等多种命名
    const isAttachmentField = /attachment|附件/i.test(column.valueCode);
    if (isAttachmentField && attachmentSummaries) {
      const links = attachmentSummaries.get(order.parentOrder?.id ?? '') ?? [];
      if (links.length === 0) return '';
      // exceljs 一格仅支持一个超链接：首个附件设为可点击链接，其余以「等 N 个」文字标注。
      const text = links.length > 1 ? `${links[0].name} 等${links.length}个` : links[0].name;
      return { text, hyperlink: links[0].url };
    }
    if (column.kind === 'const') return column.constValue;
    return this.renderExportValue(column.valueCode, order);
  }

  private columnLetter(index: number): string {
    let n = index + 1;
    let letter = '';
    while (n > 0) {
      const rem = (n - 1) % 26;
      letter = String.fromCharCode(65 + rem) + letter;
      n = Math.floor((n - 1) / 26);
    }
    return letter;
  }

  // 公式占位符 {code} 解析：模板内有对应业务列 → 替换为同行单元格引用（如 A5）；
  // 无对应列 → 从当前订单取值，作为带引号的字符串字面量写入（双引号转义为成对引号）。
  private buildFieldCellMap(columns: RichExportColumn[]): Map<string, string> {
    const map = new Map<string, string>();
    columns.forEach((column, index) => {
      if (column.kind === 'formula') return;
      const code = column.valueCode;
      if (code && !map.has(code)) map.set(code, this.columnLetter(index));
    });
    return map;
  }

  private resolveFormula(
    template: string,
    fieldCellMap: Map<string, string>,
    rowNo: number,
    order: DispatchedOrder,
  ): string {
    return template.replace(/\{(\w+)\}/g, (_match, code: string) => {
      const letter = fieldCellMap.get(code);
      if (letter) return `${letter}${rowNo}`;
      const value = this.renderExportValue(code, order);
      const text = value === null || value === undefined ? '' : String(value);
      return `"${text.replace(/"/g, '""')}"`;
    });
  }

  private toHeaderArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map((item) => (item === null || item === undefined ? '' : String(item)));
    }
    const text = this.readString(value);
    return text ? [text] : [];
  }

  private padHeaders(headers: string[], count: number): string[] {
    if (headers.length >= count) return headers;
    return [...headers, ...Array(count - headers.length).fill('')];
  }

  private async tryBuildStandardTemplateWorkbook(template: ExportTemplate, orders: DispatchedOrder[]): Promise<Workbook | null> {
    const fileName = this.resolveStandardTemplateFileName(template);
    if (!fileName) return null;
    const workbook = new Workbook();
    await workbook.xlsx.readFile(this.resolveStandardTemplatePath(fileName));
    const worksheet = workbook.worksheets.find((sheet) => sheet.state === 'visible') ?? workbook.worksheets[0];
    if (!worksheet) return workbook;
    const platform = this.normalizeSignPlatform(template.signPlatform);
    for (const sheet of workbook.worksheets) this.clearWorksheetDataValidations(sheet);
    const dataStartRow = platform === 'E签宝' ? 5 : 4;
    const columns = this.resolveRichColumns(
      { ...template, fieldList: this.prepareStandardTemplateFieldList(template.fieldList ?? []) } as ExportTemplate,
      new Map(),
    ).slice(0, worksheet.columnCount);
    this.fillStandardTemplateWorksheet(worksheet, columns, orders, dataStartRow);
    return workbook;
  }

  private async writeWorkbookBuffer(workbook: Workbook): Promise<Buffer> {
    try {
      return Buffer.from(await workbook.xlsx.writeBuffer());
    } catch (error) {
      // 捕获 ExcelJS 写出异常（如越界数据校验导致的 out of bounds），避免未处理的异步错误拖死后端进程。
      const message = error instanceof Error ? error.message : String(error);
      throw new InternalServerErrorException(`导出文件生成失败：${message}`);
    }
  }

  private clearWorksheetDataValidations(worksheet: Worksheet): void {
    // ExcelJS 中 cell.dataValidation 代理到 dataValidations.model，整体置空即可清掉全部校验。
    // 不逐格 getCell+delete：速创模板含覆盖约 161 万格的越界校验，逐格遍历会同步阻塞 event loop 导致后端假死。
    const dv = (worksheet as unknown as { dataValidations?: { model?: Record<string, unknown> } }).dataValidations;
    if (dv && dv.model) {
      dv.model = {};
    }
  }

  private resolveStandardTemplateFileName(template: ExportTemplate): string | null {
    if (template.moduleCode !== 'contract') return null;
    const platform = this.normalizeSignPlatform(template.signPlatform);
    if (platform === '速创') return '劳动合同签订批导出模板-速创.xlsx';
    if (platform === 'E签宝') return '劳动合同签订批导出模板-e签宝.xlsx';
    return null;
  }

  private resolveStandardTemplatePath(fileName: string): string {
    const candidates = [
      join(process.cwd(), 'src', 'assets', 'export-templates', fileName),
      join(process.cwd(), 'dist', 'assets', 'export-templates', fileName),
      join(__dirname, '..', '..', '..', 'assets', 'export-templates', fileName),
    ];
    const found = candidates.find((candidate) => existsSync(candidate));
    if (!found) throw new InternalServerErrorException(`标准导出模板文件缺失：${fileName}，请检查 backend/src/assets/export-templates 或 dist/assets/export-templates 是否已部署`);
    return found;
  }

  private prepareStandardTemplateFieldList(fieldList: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    const ordered = fieldList
      .filter((item) => !this.exportExcludedFieldCodes.has(this.resolveFieldCode(item)))
      .map((item, index) => ({ ...item, order: this.readNumber(item.order) ?? index + 1 }))
      .sort((left, right) => (this.readNumber(left.order) ?? 0) - (this.readNumber(right.order) ?? 0));
    const dense: Array<Record<string, unknown>> = [];
    ordered.forEach((item) => {
      const order = this.readNumber(item.order) ?? dense.length + 1;
      while (dense.length < order - 1) {
        dense.push({ const: '', order: dense.length + 1 });
      }
      dense.push({ ...item, order: dense.length + 1 });
    });
    return dense;
  }

  private fillStandardTemplateWorksheet(
    worksheet: Worksheet,
    columns: RichExportColumn[],
    orders: DispatchedOrder[],
    dataStartRow: number,
  ): void {
    const fieldCellMap = this.buildFieldCellMap(columns);
    orders.forEach((order, rowIndex) => {
      const rowNo = dataStartRow + rowIndex;
      this.copyDataRowShape(worksheet, dataStartRow, rowNo, columns.length);
      columns.forEach((column, columnIndex) => {
        const cell = worksheet.getCell(rowNo, columnIndex + 1);
        cell.value = (column.kind === 'formula'
          ? { formula: this.resolveFormula(column.formulaTemplate, fieldCellMap, rowNo, order) }
          : this.renderRichValue(column, order)) as typeof cell.value;
        if (column.kind === 'formula' && column.numFmt) cell.numFmt = column.numFmt;
      });
    });
  }

  private copyDataRowShape(worksheet: Worksheet, sourceRowNo: number, targetRowNo: number, columnCount: number): void {
    if (sourceRowNo === targetRowNo) return;
    const sourceRow = worksheet.getRow(sourceRowNo);
    const targetRow = worksheet.getRow(targetRowNo);
    targetRow.height = sourceRow.height;
    for (let columnIndex = 1; columnIndex <= columnCount; columnIndex += 1) {
      const sourceCell = sourceRow.getCell(columnIndex);
      const targetCell = targetRow.getCell(columnIndex);
      targetCell.style = this.cloneExcelObject(sourceCell.style) ?? {};
    }
  }

  private async appendWorkbookSheets(target: Workbook, source: Workbook, usedSheetNames: Set<string>, fallbackName: string): Promise<Workbook> {
    if (target.worksheets.length === 0) {
      source.worksheets.forEach((sheet) => usedSheetNames.add(sheet.name));
      return source;
    }
    for (const sourceSheet of source.worksheets) {
      const worksheet = target.addWorksheet(this.uniqueSheetName(sourceSheet.name || fallbackName, usedSheetNames), {
        state: sourceSheet.state,
        properties: this.cloneExcelObject(sourceSheet.properties),
        pageSetup: this.cloneExcelObject(sourceSheet.pageSetup),
        views: this.cloneExcelObject(sourceSheet.views),
      });
      worksheet.columns = (sourceSheet.columns ?? []).map((column, index) => ({
        key: `c${index}`,
        width: column.width,
        hidden: column.hidden,
        outlineLevel: column.outlineLevel,
        style: this.cloneExcelObject(column.style),
      }));
      for (let rowNo = 1; rowNo <= sourceSheet.rowCount; rowNo += 1) {
        const sourceRow = sourceSheet.getRow(rowNo);
        const targetRow = worksheet.getRow(rowNo);
        targetRow.height = sourceRow.height;
        targetRow.hidden = sourceRow.hidden;
        targetRow.outlineLevel = sourceRow.outlineLevel;
        for (let columnIndex = 1; columnIndex <= sourceSheet.columnCount; columnIndex += 1) {
          const sourceCell = sourceRow.getCell(columnIndex);
          const targetCell = targetRow.getCell(columnIndex);
          if (!sourceCell.isMerged || sourceCell.master === sourceCell) {
            targetCell.value = this.cloneExcelObject(sourceCell.value) as typeof targetCell.value;
          }
          targetCell.style = this.cloneExcelObject(sourceCell.style) ?? {};
          if (sourceCell.dataValidation) targetCell.dataValidation = this.cloneExcelObject(sourceCell.dataValidation);
          if (sourceCell.note) targetCell.note = this.cloneExcelObject(sourceCell.note);
        }
        targetRow.commit();
      }
      const merges = (sourceSheet as unknown as { _merges?: Record<string, { model?: { top: number; left: number; bottom: number; right: number } }> })._merges ?? {};
      for (const merge of Object.values(merges)) {
        const model = merge.model;
        if (model) worksheet.mergeCells(model.top, model.left, model.bottom, model.right);
      }
    }
    return target;
  }

  private cloneExcelObject<T>(value: T): T {
    if (value === null || value === undefined) return value;
    if (value instanceof Date) return new Date(value.getTime()) as T;
    if (Buffer.isBuffer(value)) return Buffer.from(value) as T;
    if (typeof value !== 'object') return value;
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private writeWorksheet(
    workbook: Workbook,
    sheetName: string,
    columns: RichExportColumn[],
    orders: DispatchedOrder[],
    signPlatform: string | null = null,
    attachmentSummaries?: Map<string, AttachmentLink[]>,
  ): void {
    const worksheet = workbook.addWorksheet(sheetName);
    const headerRowCount = columns.reduce((max, column) => Math.max(max, column.headers.length), 1);
    worksheet.columns = columns.map((column, index) => ({
      header: this.padHeaders(column.headers, headerRowCount),
      key: `c${index}`,
      width: Math.min(Math.max((column.headers[0]?.length ?? 4) + 6, 12), 32),
    }));
    for (let rowNo = 1; rowNo <= headerRowCount; rowNo += 1) {
      worksheet.getRow(rowNo).font = { bold: true };
    }
    const fieldCellMap = this.buildFieldCellMap(columns);
    let dataRowNo = headerRowCount;
    for (const order of orders) {
      dataRowNo += 1;
      const row: Record<string, unknown> = {};
      const cellValues: Array<{ colIndex: number; value: any }> = [];
      columns.forEach((column, index) => {
        const value = column.kind === 'formula'
          ? { formula: this.resolveFormula(column.formulaTemplate, fieldCellMap, dataRowNo, order) }
          : this.renderRichValue(column, order, attachmentSummaries);
        row[`c${index}`] = value;
        cellValues.push({ colIndex: index, value });
      });
      const added = worksheet.addRow(row);
      columns.forEach((column, index) => {
        const cellValue = cellValues[index].value;
        if (column.kind === 'formula' && column.numFmt) {
          added.getCell(index + 1).numFmt = column.numFmt;
        }
        // 附件超链接需要在单元格级别设置
        if (cellValue && typeof cellValue === 'object' && 'hyperlink' in cellValue && 'text' in cellValue) {
          const cell = added.getCell(index + 1);
          cell.value = {
            text: cellValue.text,
            hyperlink: cellValue.hyperlink,
          };
          cell.font = { color: { argb: 'FF0000FF' }, underline: true };
        }
      });
    }
    this.applyDropdownValidations(workbook, worksheet, columns, headerRowCount, orders.length);
    // e签宝模板第 3 行为「绑定串行」（内部 e签宝 字段绑定串，非人读数据），导出后隐藏。
    if (this.normalizeSignPlatform(signPlatform) === 'E签宝' && headerRowCount >= 3) {
      worksheet.getRow(3).hidden = true;
    }
  }

  // 下拉数据写入 veryHidden 的 __options sheet，主 sheet 数据区按列引用做 list dataValidation。
  // 数据区 = 数据起始行起，覆盖已有数据行 + 预留 500 行，便于复用空模板继续录入。
  private applyDropdownValidations(
    workbook: Workbook,
    worksheet: ReturnType<Workbook['addWorksheet']>,
    columns: RichExportColumn[],
    headerRowCount: number,
    dataRowsCount: number,
  ): void {
    const dropdownColumns = columns
      .map((column, index) => ({ column, index }))
      .filter(({ column }) => column.dropdownOptions.length > 0);
    if (dropdownColumns.length === 0) return;

    const optionsSheet = workbook.getWorksheet('__options') ?? workbook.addWorksheet('__options', { state: 'veryHidden' });
    const optionsStartCol = optionsSheet.columnCount + 1;
    const firstDataRow = headerRowCount + 1;
    const lastDataRow = headerRowCount + dataRowsCount + 500;

    dropdownColumns.forEach(({ column, index }, slot) => {
      const optionsCol = optionsStartCol + slot;
      const optionsColLetter = this.columnLetter(optionsCol - 1);
      column.dropdownOptions.forEach((option, optionRow) => {
        optionsSheet.getCell(optionRow + 1, optionsCol).value = option;
      });
      const ref = `'__options'!$${optionsColLetter}$1:$${optionsColLetter}$${column.dropdownOptions.length}`;
      const validation = {
        type: 'list' as const,
        allowBlank: true,
        formulae: [ref],
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: '输入有误',
        error: '请从下拉列表中选择有效选项',
      };
      for (let rowNo = firstDataRow; rowNo <= lastDataRow; rowNo += 1) {
        worksheet.getCell(rowNo, index + 1).dataValidation = validation;
      }
    });
  }

  private resolveTemplateRouteSignPlatform(order: DispatchedOrder): string | null {
    return order.moduleCode === 'contract' ? this.extractSignPlatform(order) : null;
  }

  private extractSignPlatform(order: DispatchedOrder): string | null {
    const extra = order.parentOrder?.extraData ?? {};
    return this.normalizeSignPlatform(this.readString(extra['esign_platform']));
  }

  private resolveColumns(template: ExportTemplate, fieldNameMap: Map<string, string>): ExportColumn[] {
    return this.prepareExportFieldList(template.fieldList ?? [])
      .map((item, index) => {
        const fieldCode = this.resolveFieldCode(item);
        const fallbackTitle = this.resolveFieldTitle(fieldCode, fieldNameMap);
        const rawTitle = this.readString(item.alias) ?? this.readString(item.title) ?? '';
        const title = this.shouldUseFallbackTitle(rawTitle, fieldCode) ? fallbackTitle : rawTitle;
        return { fieldCode, title, order: this.readNumber(item.order) ?? index };
      })
      .filter((item) => item.fieldCode.length > 0)
      .sort((left, right) => left.order - right.order);
  }

  private toTemplateView(template: ExportTemplate, fieldNameMap: Map<string, string>): ExportTemplateView {
    return {
      id: template.id,
      templateName: template.templateName,
      moduleCode: template.moduleCode,
      fieldList: this.normalizeFieldList(template.fieldList, fieldNameMap),
      createdBy: template.createdBy,
      isShared: template.isShared,
      signPlatform: template.signPlatform ?? null,
      createdAt: template.createdAt,
    };
  }

  private normalizeSignPlatform(value: string | null | undefined): string | null {
    const text = this.readString(value);
    return text ? text.slice(0, 16) : null;
  }

  private normalizeFieldList(
    fieldList: Array<Record<string, unknown>>,
    fieldNameMap: Map<string, string>,
  ): Array<Record<string, unknown>> {
    return fieldList.map((item) => {
      const fieldCode = this.resolveFieldCode(item);
      const fallbackName = this.resolveFieldTitle(fieldCode, fieldNameMap);
      const rawTitle = this.readString(item.alias) ?? this.readString(item.title) ?? '';
      const normalizedTitle = this.shouldUseFallbackTitle(rawTitle, fieldCode) ? fallbackName ?? fieldCode : rawTitle;
      return {
        ...item,
        alias: normalizedTitle,
        title: normalizedTitle,
      };
    });
  }

  private shouldUseFallbackTitle(value: string, fieldCode: string): boolean {
    return !value
      || value === fieldCode
      || this.isMojibakePlaceholder(value)
      || !/[\u4e00-\u9fff]/.test(value);
  }

  private resolveFieldCode(item: Record<string, unknown>): string {
    return this.readString(item.fieldCode) ?? this.readString(item.code) ?? this.readString(item.field_code) ?? '';
  }

  private resolveFieldTitle(fieldCode: string, fieldNameMap: Map<string, string>): string {
    return fieldNameMap.get(fieldCode) ?? fallbackBusinessLabel(fieldCode) ?? fieldCode;
  }

  private async loadFieldNameMap(): Promise<Map<string, string>> {
    const fields = await this.fieldConfigRepository.find({ where: { isActive: true } });
    return new Map(fields.map((field) => [field.fieldCode, field.fieldName]));
  }

  private async loadFieldOptionsMap(): Promise<Map<string, string[]>> {
    const fields = await this.fieldConfigRepository.find({ where: { isActive: true } });
    const map = new Map<string, string[]>();
    for (const field of fields) {
      const options = this.toOptionArray(field.dropdownOptions);
      if (options) map.set(field.fieldCode, options);
    }
    return map;
  }

  private isMojibakePlaceholder(value: string): boolean {
    return /^\?+$/.test(value.trim());
  }

  private renderExportValue(fieldCode: string, order: DispatchedOrder): unknown {
    const builtIns: Record<string, unknown> = {
      order_no: order.parentOrder.orderNo,
      handler_name: order.handler?.realName ?? '',
      handler_id: order.handlerId,
      employee_name: order.parentOrder.employeeName,
      employee_id_card: order.parentOrder.employeeIdCard,
      module_code: order.moduleCode,
      status: order.status,
      dispatched_at: order.dispatchedAt?.toISOString() ?? '',
      accepted_at: order.acceptedAt?.toISOString() ?? '',
      completed_at: order.completedAt?.toISOString() ?? '',
      created_by_name: order.parentOrder.creator?.realName || order.parentOrder.creator?.username || order.parentOrder.createdBy || '',
      creator_name: order.parentOrder.creator?.realName || order.parentOrder.creator?.username || order.parentOrder.createdBy || '',
    };
    return fieldCode in builtIns ? builtIns[fieldCode] : order.parentOrder.extraData[fieldCode] ?? '';
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }

  private readNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
}
