import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Workbook } from 'exceljs';
import { createHash } from 'node:crypto';
import { Repository } from 'typeorm';
import { CustomerPortalRule, WorkOrder, WorkOrderCompletionEmail } from 'src/entities';
import { UploadService } from 'src/modules/upload/upload.service';
import { PortalNotificationSettingsService } from './portal-notifications/portal-notification-settings.service';

const TEMPLATE_CODE = 'work-order-completion-result';
const TEMPLATE_VERSION = 'v1';

@Injectable()
export class CompletionEmailService {
  private readonly logger = new Logger(CompletionEmailService.name);

  constructor(
    @InjectRepository(WorkOrderCompletionEmail)
    private readonly emailRepository: Repository<WorkOrderCompletionEmail>,
    @InjectRepository(CustomerPortalRule)
    private readonly ruleRepository: Repository<CustomerPortalRule>,
    private readonly uploadService: UploadService,
    private readonly notificationSettings: PortalNotificationSettingsService,
  ) {}

  async enqueueForCompletedWorkOrder(workOrder: WorkOrder): Promise<WorkOrderCompletionEmail | null> {
    const rule = await this.ruleRepository.findOne({ where: { customerId: workOrder.customerId, isActive: true } });
    if (!rule?.completionEmailEnabled) return null;
    if (rule.completionEmailBusinessTypes.length > 0 && !rule.completionEmailBusinessTypes.includes(workOrder.orderType)) return null;
    if (rule.completionEmailTo.length === 0) return null;

    const completedVersion = workOrder.completionVersion ?? 1;
    const existing = await this.emailRepository.findOne({
      where: { workOrderId: workOrder.id, completedVersion, templateCode: TEMPLATE_CODE },
    });
    if (existing) return existing;

    const result = await this.buildResultAttachment(workOrder, rule.completionEmailFields);
    const { subject, body } = await this.notificationSettings.render('completion', {
      order_no: workOrder.orderNo, employee_name: workOrder.employeeName,
      customer_name: workOrder.customerName ?? '', business_type: workOrder.orderType,
      objection_notice: this.objectionNotice(rule.objectionDeadlineDays),
    });
    const row = this.emailRepository.create({
      workOrderId: workOrder.id,
      customerId: workOrder.customerId,
      completedVersion,
      templateCode: TEMPLATE_CODE,
      templateVersion: TEMPLATE_VERSION,
      toRecipients: [...rule.completionEmailTo],
      ccRecipients: [...rule.completionEmailCc],
      replyTo: rule.completionEmailReplyTo,
      subject,
      bodySnapshot: body,
      attachmentId: result.fileId,
      attachmentHash: result.hash,
      status: 'pending',
      attemptCount: 0,
      nextRetryAt: null,
      lastError: null,
      sentAt: null,
    });
    try {
      const saved = await this.emailRepository.save(row);
      this.logger.log(`Queued completion result email for work order ${workOrder.id}`);
      return saved;
    } catch (error) {
      // A unique key protects against two completion callbacks racing each other.
      const duplicate = await this.emailRepository.findOne({
        where: { workOrderId: workOrder.id, completedVersion, templateCode: TEMPLATE_CODE },
      });
      if (duplicate) return duplicate;
      throw error;
    }
  }

  private async buildResultAttachment(workOrder: WorkOrder, configuredFields: string[]): Promise<{ fileId: string; hash: string }> {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('办结结果');
    sheet.columns = [
      { header: '字段', key: 'field', width: 32 },
      { header: '结果', key: 'value', width: 64 },
    ];
    const values: Record<string, unknown> = {
      order_no: workOrder.orderNo,
      order_type: workOrder.orderType,
      customer_id: workOrder.customerId,
      customer_code: workOrder.customerCode,
      customer_name: workOrder.customerName,
      employee_name: workOrder.employeeName,
      employee_id_card: workOrder.employeeIdCard,
      ...workOrder.extraData,
    };
    const labels: Record<string, string> = {
      order_no: '工单号', order_type: '业务类型', customer_id: '客户ID', customer_code: '客户代码',
      customer_name: '客户名称', employee_name: '员工姓名', employee_id_card: '身份证号',
    };
    sheet.addRows((configuredFields?.length ? configuredFields : ['order_no', 'order_type', 'customer_name', 'employee_name', 'employee_id_card'])
      .map((field) => ({ field: labels[field] ?? field, value: this.stringifyValue(values[field]) })));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4AA8D8' } };
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const meta = await this.uploadService.saveBuffer({
      kind: 'excel',
      buffer,
      originalName: `工单${workOrder.orderNo}-办结结果确认.xlsx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    return { fileId: meta.fileId, hash: createHash('sha256').update(buffer).digest('hex') };
  }

  private objectionNotice(objectionDeadlineDays: number | null): string {
    return objectionDeadlineDays === null
      ? '如有异议，请按双方约定时间反馈。'
      : `如有异议，请在${objectionDeadlineDays}天内反馈；逾期未反馈视为确认结果无误。`;
  }

  private stringifyValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
}
