import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EntityManager } from 'typeorm';
import {
  BusinessScope,
  DispatchModuleCode,
  DispatchStrategy,
  InServiceHandleChannel,
  InServiceOrder,
  InServiceOrderKind,
  InServiceOrderStatus,
  OrderType,
  WorkOrder,
} from 'src/entities';
import { HandlerPickerService } from 'src/modules/dispatch-engine/handler-picker.service';

export type ResignationCertificateTrigger = 'submission' | 'materials_completed';

@Injectable()
export class ResignationCertificateAutomationService {
  constructor(private readonly handlerPicker: HandlerPickerService) {}

  async ensureForWorkOrder(
    source: WorkOrder,
    trigger: ResignationCertificateTrigger,
    manager: EntityManager,
  ): Promise<InServiceOrder | null> {
    if (!this.shouldCreate(source, trigger)) return null;
    return this.ensureCertificate(source, trigger, manager);
  }

  async ensureManualForWorkOrder(
    source: WorkOrder,
    manager: EntityManager,
  ): Promise<InServiceOrder | null> {
    if (source.orderType !== OrderType.RESIGNATION) return null;
    if (this.readText(source.extraData?.need_resignation_cert) !== '是') return null;
    return this.ensureCertificate(source, 'submission', manager);
  }

  private async ensureCertificate(
    source: WorkOrder,
    trigger: ResignationCertificateTrigger,
    manager: EntityManager,
  ): Promise<InServiceOrder> {
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [`resignation_certificate:${source.id}`],
    );

    const repository = manager.getRepository(InServiceOrder);
    // ponytail: keep the source id in JSONB; add an indexed column only when automated volume requires it.
    const existing = await repository.createQueryBuilder('certificate')
      .where('certificate.order_kind = :orderKind', {
        orderKind: InServiceOrderKind.RESIGNATION_CERTIFICATE,
      })
      .andWhere("certificate.extra_data ->> 'source_work_order_id' = :sourceWorkOrderId", {
        sourceWorkOrderId: source.id,
      })
      .getOne();
    if (existing) return existing;

    const handlerId = await this.handlerPicker.pick(
      DispatchStrategy.TEAM_CLAIM,
      DispatchModuleCode.RESIGNATION_CERT,
      manager,
      undefined,
      source.businessScope ?? BusinessScope.BEILUN,
    );
    const now = new Date();
    const extraData = source.extraData ?? {};
    const order = repository.create({
      orderNo: this.generateOrderNo(),
      orderType: OrderType.IN_SERVICE,
      orderKind: InServiceOrderKind.RESIGNATION_CERTIFICATE,
      businessScope: source.businessScope ?? BusinessScope.BEILUN,
      employeeName: source.employeeName,
      idCardNo: source.employeeIdCard,
      extraData: {
        resignationDate: this.readText(extraData.resignation_date)
          ?? this.readText(extraData.resignationDate),
        resignationReason: this.readText(extraData.resignation_reason)
          ?? this.readText(extraData.resignationReason),
        lastWorkDate: this.readText(extraData.last_work_date)
          ?? this.readText(extraData.lastWorkDate),
        deliveryAddress: this.readText(extraData.cert_delivery_address)
          ?? this.readText(extraData.deliveryAddress),
        source_work_order_id: source.id,
        source_order_no: source.orderNo,
        source_trigger: trigger,
      },
      customerId: source.customerId,
      departmentId: source.departmentId,
      expectedCompletionDate: null,
      businessReason: '开具离职证明',
      businessType: null,
      processType: null,
      requirementType: null,
      province: null,
      city: null,
      district: null,
      contactPhone: null,
      businessDescription: null,
      serviceFee: null,
      handleChannel: InServiceHandleChannel.ONLINE,
      attachments: [],
      status: InServiceOrderStatus.DISPATCHED,
      pendingReturnStatus: null,
      transferHistory: [],
      handlerId,
      createdBy: source.createdBy,
      approvedBy: null,
      rejectedBy: null,
      closedBy: null,
      rejectionReason: null,
      pendingInfoReason: null,
      completionRemark: null,
      closeReason: null,
      approvedAt: null,
      rejectedAt: null,
      dispatchedAt: now,
      acceptedAt: null,
      confirmedAt: null,
      processingAt: null,
      pendingInfoAt: null,
      completedAt: null,
      closedAt: null,
    });
    return repository.save(order);
  }

  private shouldCreate(
    source: WorkOrder,
    trigger: ResignationCertificateTrigger,
  ): boolean {
    if (source.orderType !== OrderType.RESIGNATION) return false;
    const extraData = source.extraData ?? {};
    if (this.readText(extraData.need_resignation_cert) !== '是') return false;
    const sharesMaterialCollection = this.readText(extraData.need_resignation_share);
    return trigger === 'materials_completed'
      ? sharesMaterialCollection === '是'
      : sharesMaterialCollection === '否';
  }

  private readText(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    return text || null;
  }

  private generateOrderNo(): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `RCERT-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }
}
