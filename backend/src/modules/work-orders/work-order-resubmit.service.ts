import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { hasManagementScopeRole, isAdminRole } from 'src/common/auth/role-permissions';
import { businessException } from 'src/common/exceptions/business-exception';
import {
  DispatchedOrder,
  DispatchedOrderStatus,
  Notification,
  OperationLog,
  WorkOrder,
  WorkOrderStatus,
} from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { DispatchEngineService } from 'src/modules/dispatch-engine/dispatch-engine.service';
import { FieldPermissionService } from 'src/modules/field-permissions/field-permission.service';
import { snapshotWorkOrder, toWorkOrderSubOrderItems } from './work-order.mapper';
import { WorkOrderDetailItem, WorkOrderSubOrderItem } from './work-order.types';
import { SubmitWorkOrderDto } from './dto/submit.dto';
import { WorkOrderValidationService } from './work-order-validation.service';
import { buildOnboardingChildren } from './onboarding-dispatch.helper';

type DispatchChildInput = {
  moduleCode: string;
  handlerId: string | null;
  visibleFields: string[];
};

@Injectable()
export class WorkOrderResubmitService {
  constructor(
    @InjectRepository(WorkOrder)
    private readonly workOrderRepository: Repository<WorkOrder>,
    @InjectRepository(DispatchedOrder)
    private readonly dispatchedOrderRepository: Repository<DispatchedOrder>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(OperationLog)
    private readonly operationLogRepository: Repository<OperationLog>,
    private readonly validationService: WorkOrderValidationService,
    private readonly fieldPermissionService: FieldPermissionService,
    private readonly dispatchEngineService?: DispatchEngineService,
  ) {}

  async resubmit(
    id: string,
    payload: SubmitWorkOrderDto,
    user: JwtUserPayload,
  ): Promise<{ workOrder: WorkOrderDetailItem; dispatchedOrders: WorkOrderSubOrderItem[] }> {
    const result = await this.workOrderRepository.manager.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`work_order:resubmit:${id}`]);
      const workOrderRepo = manager.getRepository(WorkOrder);
      const dispatchedRepo = manager.getRepository(DispatchedOrder);
      const notificationRepo = manager.getRepository(Notification);
      const operationLogRepo = manager.getRepository(OperationLog);
      const workOrder = await workOrderRepo.findOne({ where: { id } });
      if (!workOrder) throw businessException(4100, HttpStatus.NOT_FOUND, '工单不存在');
      if (workOrder.createdBy !== user.sub && !isAdminRole(user.roles)) {
        if (!hasManagementScopeRole(user.roles)) {
          throw businessException(5000, HttpStatus.FORBIDDEN, '无权限访问该资源');
        }
        const departmentIds = await this.validationService.resolveUserDepartmentIds(user.sub);
        if (!departmentIds.includes(workOrder.departmentId)) {
          throw businessException(5000, HttpStatus.FORBIDDEN, '无权限访问该资源');
        }
      }
      if (workOrder.status === WorkOrderStatus.PENDING) {
        const latestModifyResubmit = await operationLogRepo.findOne({
          where: {
            entityType: 'work_order',
            entityId: workOrder.id,
            actionType: 'salesperson_modify_resubmit',
            userId: user.sub,
          },
          order: { createdAt: 'DESC' },
        });
        if (latestModifyResubmit) {
          this.mergeExtraData(workOrder, payload.extraData);
          await this.validationService.validateWorkOrder(workOrder);
          const childrenToCreate = this.dispatchEngineService
            ? (await this.dispatchEngineService.evaluateDetailed(workOrder, manager)).childrenToCreate
            : await buildOnboardingChildren(workOrder, manager, this.fieldPermissionService);
          if (childrenToCreate.length === 0) {
            throw businessException(4202, HttpStatus.BAD_REQUEST, '无可派发规则命中');
          }
          const existing = await dispatchedRepo.find({ where: { parentOrderId: workOrder.id } });
          const touched = await this.applyChildren(dispatchedRepo, existing, childrenToCreate, workOrder.id);
          await workOrderRepo.save(workOrder);
          await this.notifyHandlers(notificationRepo, touched, workOrder);
          const rows = await dispatchedRepo.find({ where: { parentOrderId: workOrder.id }, relations: { handler: true } });
          return {
            workOrderId: workOrder.id,
            dispatchedOrders: toWorkOrderSubOrderItems(rows),
          };
        }
      }
      if (![WorkOrderStatus.PROCESSING, WorkOrderStatus.RETURNED].includes(workOrder.status)) {
        throw businessException(4114, HttpStatus.CONFLICT, 'Only processing or returned work orders can be resubmitted');
      }
      const before = snapshotWorkOrder(workOrder);
      this.mergeExtraData(workOrder, payload.extraData);
      await this.validationService.validateWorkOrder(workOrder);
      const childrenToCreate = this.dispatchEngineService
        ? (await this.dispatchEngineService.evaluateDetailed(workOrder, manager)).childrenToCreate
        : await buildOnboardingChildren(workOrder, manager, this.fieldPermissionService);
      if (childrenToCreate.length === 0) {
        throw businessException(4202, HttpStatus.BAD_REQUEST, '无可派发规则命中');
      }
      const existing = await dispatchedRepo.find({ where: { parentOrderId: workOrder.id } });
      const touched = await this.applyChildren(dispatchedRepo, existing, childrenToCreate, workOrder.id);
      workOrder.status = WorkOrderStatus.PENDING;
      workOrder.submittedAt = workOrder.submittedAt ?? new Date();
      await workOrderRepo.save(workOrder);
      for (const child of touched) {
        await operationLogRepo.save(operationLogRepo.create({
          entityType: 'dispatched_order',
          entityId: child.id,
          userId: user.sub,
          actionType: 'dispatched',
          beforeData: null,
          afterData: {
            parentOrderId: workOrder.id,
            dispatchedOrderId: child.id,
            moduleCode: child.moduleCode,
            handlerId: child.handlerId,
            toUserId: child.handlerId,
            status: child.status,
            contextFields: {
              parentOrderId: workOrder.id,
              dispatchedOrderId: child.id,
              moduleCode: child.moduleCode,
              handlerId: child.handlerId,
              toUserId: child.handlerId,
            },
          },
          ipAddress: null,
        }));
      }
      await this.notifyHandlers(notificationRepo, touched, workOrder);
      await operationLogRepo.save(operationLogRepo.create({
        entityType: 'work_order', entityId: workOrder.id, userId: user.sub,
        actionType: 'salesperson_modify_resubmit', beforeData: before,
        afterData: {
          ...snapshotWorkOrder(workOrder),
          auditTitle: '业务员修改后重提',
          contextFields: {
            oldStatus: before.status,
            newStatus: workOrder.status,
            auditTitle: '业务员修改后重提',
          },
        }, ipAddress: null,
      }));
      const rows = await dispatchedRepo.find({ where: { parentOrderId: workOrder.id }, relations: { handler: true } });
      return {
        workOrderId: workOrder.id,
        dispatchedOrders: toWorkOrderSubOrderItems(rows),
      };
    });
    return { workOrder: await this.loadDetail(result.workOrderId), dispatchedOrders: result.dispatchedOrders };
  }

  private mergeExtraData(workOrder: WorkOrder, extraData?: Record<string, unknown>): void {
    if (!extraData) return;
    workOrder.extraData = { ...workOrder.extraData, ...extraData };
    if (extraData.employee_name) workOrder.employeeName = this.validationService.requireText(extraData.employee_name, 'employee_name');
    if (extraData.id_card_no) workOrder.employeeIdCard = this.validationService.requireText(extraData.id_card_no, 'id_card_no');
  }

  private async applyChildren(
    repository: Repository<DispatchedOrder>,
    existingChildren: DispatchedOrder[],
    nextChildren: DispatchChildInput[],
    parentOrderId: string,
  ): Promise<DispatchedOrder[]> {
    const byModule = new Map(existingChildren.map((child) => [child.moduleCode, child]));
    const touched: DispatchedOrder[] = [];
    for (const next of nextChildren) {
      const current = byModule.get(next.moduleCode);
      if (current) {
        if (current.status !== DispatchedOrderStatus.COMPLETED) {
          current.status = DispatchedOrderStatus.PENDING;
          current.handlerId = next.handlerId;
          current.visibleFields = next.visibleFields;
          current.returnReason = null;
          current.dispatchedAt = new Date();
          current.acceptedAt = null;
          current.completedAt = null;
          touched.push(await repository.save(current));
        }
        byModule.delete(next.moduleCode);
      } else {
        touched.push(await repository.save(repository.create({
          parentOrderId, moduleCode: next.moduleCode, status: DispatchedOrderStatus.PENDING,
          handlerId: next.handlerId, visibleFields: next.visibleFields, returnReason: null,
          dispatchedAt: new Date(), acceptedAt: null, completedAt: null,
        })));
      }
    }
    for (const child of byModule.values()) {
      if (child.status === DispatchedOrderStatus.RETURNED) {
        child.status = DispatchedOrderStatus.COMPLETED;
        child.completedAt = new Date();
        child.returnReason = '重新提交后不再命中派发规则';
        await repository.save(child);
      }
    }
    return touched;
  }

  private async notifyHandlers(repository: Repository<Notification>, children: DispatchedOrder[], workOrder: WorkOrder): Promise<void> {
    for (const child of children) {
      if (!child.handlerId) continue;
      await repository.save(repository.create({
        userId: child.handlerId, bizType: 'dispatch_resubmit', title: '退回工单已重新提交',
        content: `主工单 ${workOrder.orderNo} 已重新派发到 ${child.moduleCode}`,
        link: `/dispatched-orders/${child.id}`,
        payload: { workOrderId: workOrder.id, dispatchedOrderId: child.id, moduleCode: child.moduleCode },
        isRead: false, readAt: null,
      }));
    }
  }

  private async loadDetail(id: string): Promise<WorkOrderDetailItem> {
    const workOrder = await this.workOrderRepository.findOne({
      where: { id },
      relations: { creator: true, department: true, customer: true, dispatchedOrders: { handler: true } },
    });
    if (!workOrder) throw businessException(4100, HttpStatus.NOT_FOUND, '工单不存在');
    const subOrders = toWorkOrderSubOrderItems(workOrder.dispatchedOrders);
    return {
      id: workOrder.id, orderNo: workOrder.orderNo, orderType: workOrder.orderType,
      businessScope: workOrder.businessScope, business_scope: workOrder.businessScope, status: workOrder.status,
      createdBy: { id: workOrder.creator.id, username: workOrder.creator.username, realName: workOrder.creator.realName },
      department: { id: workOrder.department.id, name: workOrder.department.name },
      customer: { id: workOrder.customer.id, customerCode: workOrder.customer.customerCode, customerName: workOrder.customer.customerName },
      employeeName: workOrder.employeeName, employeeIdCard: workOrder.employeeIdCard, extraData: workOrder.extraData,
      dispatchedOrders: subOrders,
      subOrders,
      sub_orders: subOrders,
      submittedAt: workOrder.submittedAt, completedAt: workOrder.completedAt,
      createdAt: workOrder.createdAt, updatedAt: workOrder.updatedAt,
    };
  }


}
