import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Workbook } from 'exceljs';
import { Repository } from 'typeorm';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { toPageResult } from 'src/common/types/pagination.types';
import { DispatchedOrder, ExportTemplate, FieldConfig, OperationLog } from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { DispatchedOrderExportResult } from 'src/modules/dispatched-orders/dispatched-order.types';
import { fallbackBusinessLabel } from 'src/modules/notifications/notification-display.util';
import { UploadService } from 'src/modules/upload/upload.service';

interface ExportColumn {
  fieldCode: string;
  title: string;
  order: number;
}

export interface ExportTemplateView {
  id: string;
  templateName: string;
  moduleCode: string;
  fieldList: Array<Record<string, unknown>>;
  createdBy: string;
  isShared: boolean;
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
  }): Promise<ExportTemplateView> {
    const fieldNameMap = await this.loadFieldNameMap();
    const saved = await this.repository.save(this.repository.create({
      templateName: input.templateName,
      moduleCode: input.moduleCode,
      fieldList: this.normalizeFieldList(input.fieldList, fieldNameMap),
      createdBy: input.createdBy,
      isShared: input.isShared ?? false,
    }));
    return this.toTemplateView(saved, fieldNameMap);
  }

  async update(id: string, input: Partial<{ templateName: string; moduleCode: string; fieldList: Array<Record<string, unknown>>; isShared: boolean }>): Promise<ExportTemplateView> {
    const row = await this.loadTemplate(id);
    const fieldNameMap = await this.loadFieldNameMap();
    Object.assign(row, input, input.fieldList ? { fieldList: this.normalizeFieldList(input.fieldList, fieldNameMap) } : {});
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
      relations: { parentOrder: true, handler: true },
    });
    if (!order) throw new NotFoundException('子工单未找到');
    const template = templateId
      ? await this.loadTemplate(templateId)
      : await this.resolveDefaultTemplate(order.moduleCode, order.visibleFields ?? []);
    if (template.moduleCode !== order.moduleCode) throw new NotFoundException('该模块下未找到导出模板');
    return this.applyTemplateToOrders(template, [order], [dispatchedOrderId], user, 'dispatched_order');
  }

  async exportDispatchedOrdersAuto(dispatchedOrderIds: string[], templateId: string | undefined, user: JwtUserPayload): Promise<DispatchedOrderExportResult> {
    const ids = Array.from(new Set(dispatchedOrderIds));
    if (ids.length === 0) throw new NotFoundException('未选择子工单');
    if (templateId) return this.apply(templateId, ids, user);

    const orders = await this.loadOrdersByIds(ids);
    const fieldNameMap = await this.loadFieldNameMap();
    const workbook = new Workbook();
    const usedSheetNames = new Set<string>();
    let rowCount = 0;
    const grouped = new Map<string, DispatchedOrder[]>();
    for (const order of orders) {
      const list = grouped.get(order.moduleCode) ?? [];
      list.push(order);
      grouped.set(order.moduleCode, list);
    }

    for (const [moduleCode, moduleOrders] of grouped.entries()) {
      const visibleFields = Array.from(new Set(moduleOrders.flatMap((order) => order.visibleFields ?? [])));
      const template = await this.resolveDefaultTemplate(moduleCode, visibleFields);
      const result = this.buildResult(template, moduleOrders, fieldNameMap);
      rowCount += result.rowCount ?? result.rows.length;
      const worksheet = workbook.addWorksheet(this.uniqueSheetName(template.templateName || moduleCode, usedSheetNames));
      worksheet.columns = result.columns.map((column) => ({ header: column.title, key: column.title, width: Math.min(Math.max(column.title.length + 6, 12), 32) }));
      worksheet.getRow(1).font = { bold: true };
      result.rows.forEach((row) => worksheet.addRow(row));
    }

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const meta = await this.uploadService.saveBuffer({
      kind: 'excel',
      buffer,
      originalName: `子工单批量导出-${Date.now()}.xlsx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await this.operationLogRepository.save(this.operationLogRepository.create({
      entityType: 'dispatched_order',
      entityId: ids[0],
      userId: user.sub,
      actionType: 'batch_export_auto_template',
      beforeData: null,
      afterData: { dispatchedOrderIds: ids, fileId: meta.fileId, rowCount, moduleCodes: Array.from(grouped.keys()) },
      ipAddress: null,
    }));
    return { templateId: null, templateName: '子工单批量导出', moduleCode: grouped.size === 1 ? Array.from(grouped.keys())[0] : 'mixed', columns: [], rows: [], rowCount, fileId: meta.fileId, fileName: meta.originalName, downloadUrl: `/api/files/${meta.fileId}` };
  }

  private async applyTemplateToOrders(
    template: ExportTemplate,
    orders: DispatchedOrder[],
    dispatchedOrderIds: string[],
    user: JwtUserPayload,
    entityType: 'export_template' | 'dispatched_order',
  ): Promise<DispatchedOrderExportResult> {
    const result = this.buildResult(template, orders, await this.loadFieldNameMap());
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet(template.templateName);
    worksheet.columns = result.columns.map((column) => ({ header: column.title, key: column.title, width: Math.min(Math.max(column.title.length + 6, 12), 32) }));
    worksheet.getRow(1).font = { bold: true };
    result.rows.forEach((row) => worksheet.addRow(row));
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
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
      .leftJoinAndSelect('d.handler', 'h')
      .where('d.id IN (:...ids)', { ids })
      .andWhere('d.module_code = :moduleCode', { moduleCode })
      .orderBy('d.created_at', 'ASC')
      .getMany();
    if (orders.length === 0) throw new NotFoundException('该模板模块下未匹配到子工单');
    return orders;
  }

  private async resolveDefaultTemplate(moduleCode: string, visibleFields: string[]): Promise<ExportTemplate> {
    const shared = await this.repository.findOne({ where: { moduleCode, isShared: true }, order: { createdAt: 'DESC' } });
    if (shared) {
      shared.fieldList = this.ensureImportIdentityColumns(shared.fieldList);
      return shared;
    }
    const fieldList = this.ensureImportIdentityColumns(visibleFields.map((fieldCode, order) => ({ fieldCode, order: order + 10 })));
    return this.repository.create({ id: '', templateName: `${moduleCode}-default`, moduleCode, fieldList, createdBy: '', isShared: false });
  }

  private ensureImportIdentityColumns(fieldList: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    const identityColumns: Array<Record<string, unknown>> = [
      { fieldCode: 'order_no', alias: '工单编号', order: 0 },
      { fieldCode: 'employee_id_card', alias: '员工证件号', order: 1 },
    ];
    const existed = new Set(fieldList.map((item) => this.resolveFieldCode(item)));
    return [
      ...identityColumns.filter((item) => !existed.has(String(item.fieldCode))),
      ...fieldList.map((item, index) => ({ ...item, order: this.readNumber(item.order) ?? index + 10 })),
    ];
  }

  private buildResult(
    template: ExportTemplate,
    orders: DispatchedOrder[],
    fieldNameMap: Map<string, string>,
  ): DispatchedOrderExportResult {
    const columns = this.resolveColumns(template, fieldNameMap);
    const rows = orders.map((order) => {
      const row: Record<string, unknown> = {};
      for (const column of columns) row[column.title] = this.renderExportValue(column.fieldCode, order);
      return row;
    });
    return { templateId: template.id || null, templateName: template.templateName, moduleCode: template.moduleCode, columns, rows, rowCount: rows.length };
  }

  private resolveColumns(template: ExportTemplate, fieldNameMap: Map<string, string>): ExportColumn[] {
    return template.fieldList
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
      createdAt: template.createdAt,
    };
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
