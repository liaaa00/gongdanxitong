import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  DispatchedOrder,
  DispatchedOrderStatus,
  OrderType,
  WorkOrder,
} from 'src/entities';
import { DispatchEngineService } from 'src/modules/dispatch-engine/dispatch-engine.service';

export type ResignationCertificateTrigger = 'submission' | 'materials_completed';

export interface EnsuredResignationCertificate {
  order: DispatchedOrder;
  created: boolean;
}

@Injectable()
export class ResignationCertificateAutomationService {
  constructor(private readonly dispatchEngine: DispatchEngineService) {}

  async ensureForWorkOrder(
    source: WorkOrder,
    trigger: ResignationCertificateTrigger,
    manager: EntityManager,
  ): Promise<EnsuredResignationCertificate | null> {
    if (!this.shouldCreate(source, trigger)) return null;
    return this.ensureCertificate(source, manager);
  }

  async ensureManualForWorkOrder(
    source: WorkOrder,
    manager: EntityManager,
  ): Promise<EnsuredResignationCertificate | null> {
    if (source.orderType !== OrderType.RESIGNATION) return null;
    if (this.readText(source.extraData?.need_resignation_cert) !== '是') return null;
    return this.ensureCertificate(source, manager);
  }

  private async ensureCertificate(
    source: WorkOrder,
    manager: EntityManager,
  ): Promise<EnsuredResignationCertificate | null> {
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [`resignation_certificate:${source.id}`],
    );

    const repository = manager.getRepository(DispatchedOrder);
    const existing = await repository.findOne({
      where: {
        parentOrderId: source.id,
        moduleCode: 'resignation_cert',
      },
    });
    if (existing) return { order: existing, created: false };

    const evaluation = await this.dispatchEngine.evaluateDetailed(source, manager);
    const target = evaluation.childrenToCreate.find((child) => child.moduleCode === 'resignation_cert');
    if (!target) return null;

    const order = repository.create({
      parentOrderId: source.id,
      moduleCode: 'resignation_cert',
      status: DispatchedOrderStatus.PENDING,
      handlerId: target.handlerId,
      visibleFields: target.visibleFields,
      returnReason: null,
      flowRound: 0,
      completionRemark: null,
      dispatchedAt: new Date(),
      dueAt: target.dueAt ?? null,
      slaHours: target.slaHours ?? null,
      slaReminderBeforeHours: target.slaReminderBeforeHours ?? null,
      acceptedAt: null,
      completedAt: null,
      voidAt: null,
    });
    return {
      order: await repository.save(order),
      created: true,
    };
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
}
