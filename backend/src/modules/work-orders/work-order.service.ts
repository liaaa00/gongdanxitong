import { ForbiddenException, HttpStatus, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, QueryFailedError, Repository } from 'typeorm';
import {
  BUSINESS_LEADER_ROLES,
  BUSINESS_MANAGER_ROLES,
  hasAnyRole,
  hasModuleSupervisorRole,
  isAdminRole,
} from 'src/common/auth/role-permissions';
import { businessException } from 'src/common/exceptions/business-exception';
import {
  DispatchedOrder,
  DispatchedOrderStatus,
  FieldConfig,
  ImportJob,
  ModuleField,
  ModuleHandler,
  ModuleSupervisor,
  Notification,
  OperationLog,
  RoleLevel,
  UserRole,
  WorkOrder,
  WorkOrderFieldDirtyMark,
  WorkOrderStatus,
} from 'src/entities';
import { buildOnboardingChildren, getModuleSortOrder } from './onboarding-dispatch.helper';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { DispatchEngineService } from 'src/modules/dispatch-engine/dispatch-engine.service';
import { FieldPermissionService } from 'src/modules/field-permissions/field-permission.service';
import { FieldChangeHook } from 'src/modules/notifications/field-change.hook';
import {
  describeActionCode,
  getOperationLogContextFields,
  humanizeActionCode,
  humanizeEntityType,
  toOperationLogActionCode,
} from 'src/modules/operation-logs/operation-log-semantics';
import { ImportPreviewDto } from './dto/import-preview.dto';
import { ListWorkOrderQueryDto } from './dto/list-query.dto';
import { SubmitWorkOrderDto } from './dto/submit.dto';
import { UpdateWorkOrderDto } from './dto/update.dto';
import { UrgeWorkOrderDto } from './dto/urge.dto';
import { VoidApproveWorkOrderDto } from './dto/void-approve.dto';
import { VoidWorkOrderDto } from './dto/void.dto';
import { WithdrawApproveWorkOrderDto } from './dto/withdraw-approve.dto';
import { WithdrawWorkOrderDto } from './dto/withdraw.dto';
import { CreateWorkOrderDto } from './dto/create.dto';
import {
  findDuplicateIdCardInMonth,
  isDuplicateIdCardIndexError,
  throwDuplicateIdCardConflict,
} from './duplicate-id-card.util';
import { snapshotWorkOrder, toWorkOrderListItem, toWorkOrderSubOrderItems } from './work-order.mapper';
import {
  PagedResponse,
  WorkOrderDetailItem,
  WorkOrderListItem,
  WorkOrderSubOrderItem,
  WorkOrderTimelineItem,
  WorkOrderTimelineResponse,
} from './work-order.types';
import { WorkOrderResubmitService } from './work-order-resubmit.service';
import { WorkOrderValidationService } from './work-order-validation.service';

@Injectable()
export class WorkOrderService {
  constructor(
    @InjectRepository(WorkOrder)
    private readonly workOrderRepository: Repository<WorkOrder>,
    @InjectRepository(DispatchedOrder)
    private readonly dispatchedOrderRepository: Repository<DispatchedOrder>,
    @InjectRepository(FieldConfig)
    private readonly fieldConfigRepository: Repository<FieldConfig>,
    @InjectRepository(ImportJob)
    private readonly importJobRepository: Repository<ImportJob>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(OperationLog)
    private readonly operationLogRepository: Repository<OperationLog>,
    private readonly validationService: WorkOrderValidationService,
    private readonly fieldPermissionService: FieldPermissionService,
    private readonly resubmitService?: WorkOrderResubmitService,
    private readonly fieldChangeHook?: FieldChangeHook,
    @Optional()
    @InjectRepository(ModuleField)
    private readonly moduleFieldRepository?: Repository<ModuleField>,
    @Optional()
    @InjectRepository(WorkOrderFieldDirtyMark)
    private readonly dirtyMarkRepository?: Repository<WorkOrderFieldDirtyMark>,
    @Optional()
    @InjectRepository(ModuleHandler)
    private readonly moduleHandlerRepository?: Repository<ModuleHandler>,
    @Optional()
    @InjectRepository(ModuleSupervisor)
    private readonly moduleSupervisorRepository?: Repository<ModuleSupervisor>,
    @Optional()
    @InjectRepository(UserRole)
    private readonly userRoleRepository?: Repository<UserRole>,
    @Optional()
    private readonly dispatchEngineService?: DispatchEngineService,
  ) {}

  async createDraft(payload: CreateWorkOrderDto, user: JwtUserPayload): Promise<WorkOrderDetailItem> {
    this.assertBusinessOwnerReadOnly(user);
    const extraData = { ...payload.extraData };
    const customerId = await this.validationService.resolveCustomerId(payload.customerId, extraData);
    const departmentId = await this.validationService.resolveDepartmentId(payload.departmentId, user.sub);
    const branchId = typeof this.validationService.resolveBranchId === 'function'
      ? await this.validationService.resolveBranchId(payload.extraData?.branchId as string | undefined, customerId, extraData)
      : null;
    const employeeIdCard = this.validationService.requireText(extraData.id_card_no, 'id_card_no');
    const duplicate = await findDuplicateIdCardInMonth(this.workOrderRepository, {
      orderType: payload.orderType,
      employeeIdCard,
    });
    if (duplicate) {
      throwDuplicateIdCardConflict({ conflictOrderNo: duplicate.orderNo });
    }

    let workOrder: WorkOrder;
    try {
      workOrder = await this.workOrderRepository.save(
        this.workOrderRepository.create({
          orderNo: await this.validationService.generateOrderNo(),
          orderType: payload.orderType,
          status: WorkOrderStatus.DRAFT,
          createdBy: user.sub,
          departmentId,
          customerId,
          branchId,
          customerCode: this.readText(extraData.customer_code),
          branchCode: this.readText(extraData.branch_code) ?? this.readText(extraData.customer_code),
          customerName: this.readText(extraData.customer_name),
          employeeName: this.validationService.requireText(extraData.employee_name, 'employee_name'),
          employeeIdCard,
          extraData,
          submittedAt: null,
          completedAt: null,
          lastModifiedAt: null,
          lastModifiedBy: null,
        }),
      );
    } catch (error) {
      if (isDuplicateIdCardIndexError(error)) {
        throwDuplicateIdCardConflict();
      }
      throw error;
    }

    await this.writeOperationLog('work_order', workOrder.id, user.sub, 'create_draft', null, snapshotWorkOrder(workOrder));
    return this.loadDetail(workOrder.id);
  }

  async update(id: string, payload: UpdateWorkOrderDto, user: JwtUserPayload): Promise<WorkOrderDetailItem> {
    this.assertBusinessOwnerReadOnly(user);
    const workOrder = await this.loadWorkOrder(id);
    this.assertOwner(workOrder, user.sub);
    const editableStatuses = [WorkOrderStatus.DRAFT, WorkOrderStatus.PROCESSING, WorkOrderStatus.RETURNED];
    if (!editableStatuses.includes(workOrder.status)) {
      throw businessException(4101, HttpStatus.CONFLICT, '工单状态不允许该操作');
    }
    if (workOrder.status === WorkOrderStatus.RETURNED && (payload.customerId || payload.departmentId)) {
      throw businessException(4114, HttpStatus.CONFLICT, '主工单非 returned 态，仅允许修改 extraData');
    }

    const activeChildren = workOrder.status === WorkOrderStatus.PROCESSING || workOrder.status === WorkOrderStatus.COMPLETED
      ? await this.dispatchedOrderRepository.find({ where: { parentOrderId: workOrder.id } })
      : [];
    if (payload.extraData && activeChildren.some((child) => child.status === DispatchedOrderStatus.COMPLETED)) {
      throw businessException(4116, HttpStatus.CONFLICT, '存在已完成子单，需由模块主管或管理员退回后才能修改');
    }
    if (workOrder.status !== WorkOrderStatus.RETURNED) {
      await this.assertMainOperationMovedToChildren(workOrder, user, '修改');
    }

    const beforeExtraData = { ...workOrder.extraData };
    const before = snapshotWorkOrder(workOrder);
    const shouldRequireResubmitAfterEdit = [WorkOrderStatus.PROCESSING, WorkOrderStatus.RETURNED].includes(workOrder.status);
    if (payload.customerId) {
      workOrder.customerId = payload.customerId;
    }
    if (payload.departmentId) {
      workOrder.departmentId = payload.departmentId;
    }
    if (payload.extraData) {
      this.assertSalesEditableFields(payload.extraData);
      workOrder.extraData = { ...workOrder.extraData, ...payload.extraData };
      if (payload.extraData.employee_name) {
        workOrder.employeeName = this.validationService.requireText(payload.extraData.employee_name, 'employee_name');
      }
      if (payload.extraData.id_card_no) {
        workOrder.employeeIdCard = this.validationService.requireText(payload.extraData.id_card_no, 'id_card_no');
      }
      workOrder.customerCode = this.readText(workOrder.extraData.customer_code) ?? workOrder.customerCode;
      workOrder.branchCode = this.readText(workOrder.extraData.branch_code) ?? workOrder.branchCode;
      workOrder.customerName = this.readText(workOrder.extraData.customer_name) ?? workOrder.customerName;
    }

    const duplicate = await findDuplicateIdCardInMonth(this.workOrderRepository, {
      orderType: workOrder.orderType,
      employeeIdCard: workOrder.employeeIdCard,
      createdAt: workOrder.createdAt,
      excludeId: workOrder.id,
    });
    if (duplicate) {
      throwDuplicateIdCardConflict({ conflictOrderNo: duplicate.orderNo });
    }

    workOrder.lastModifiedAt = new Date();
    workOrder.lastModifiedBy = user.sub;
    if (shouldRequireResubmitAfterEdit) {
      workOrder.status = WorkOrderStatus.PENDING;
      workOrder.completedAt = null;
    }
    try {
      await this.workOrderRepository.save(workOrder);
    } catch (error) {
      if (isDuplicateIdCardIndexError(error)) {
        throwDuplicateIdCardConflict();
      }
      throw error;
    }
    await this.syncDispatchedOrderSnapshots(workOrder.id);
    if (payload.extraData && (workOrder.status === WorkOrderStatus.PROCESSING || workOrder.status === WorkOrderStatus.PENDING)) {
      await this.createDirtyMarksForSalesUpdate(workOrder, beforeExtraData, workOrder.extraData, user.sub);
    }
    const after = snapshotWorkOrder(workOrder);
    const actionType = shouldRequireResubmitAfterEdit ? 'salesperson_modify_resubmit' : 'update';
    const auditAfter = shouldRequireResubmitAfterEdit
      ? {
          ...after,
          auditTitle: '业务员修改后重提',
          contextFields: {
            oldStatus: before.status,
            newStatus: workOrder.status,
            auditTitle: '业务员修改后重提',
          },
        }
      : after;
    await this.writeOperationLog('work_order', workOrder.id, user.sub, workOrder.status === WorkOrderStatus.COMPLETED ? 'completed_modify' : actionType, before, auditAfter);
    if (this.fieldChangeHook) {
      await this.fieldChangeHook.onWorkOrderUpdated({
        orderId: workOrder.id,
        actorUserId: user.sub,
        diff: this.fieldChangeHook.buildDiff(before, after),
        bizType: workOrder.status === WorkOrderStatus.COMPLETED ? 'order.completed_modified' : 'order.field_changed',
      });
    }

    if (shouldRequireResubmitAfterEdit && this.resubmitService) {
      const resubmitted = await this.resubmitService.resubmit(workOrder.id, { extraData: workOrder.extraData }, user);
      return resubmitted.workOrder;
    }

    return this.loadDetail(workOrder.id);
  }

  async submit(
    id: string,
    payload: SubmitWorkOrderDto,
    user: JwtUserPayload,
  ): Promise<{ workOrder: WorkOrderDetailItem; dispatchedOrders: WorkOrderSubOrderItem[] }> {
    this.assertBusinessOwnerReadOnly(user);
    return this.workOrderRepository.manager.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`work_order:submit:${id}`]);
      const workOrderRepo = manager.getRepository(WorkOrder);
      const dispatchedRepo = manager.getRepository(DispatchedOrder);
      const notificationRepo = manager.getRepository(Notification);
      const operationLogRepo = manager.getRepository(OperationLog);

      const workOrder = await workOrderRepo.findOne({ where: { id } });
      if (!workOrder) {
        throw businessException(4100, HttpStatus.NOT_FOUND, '工单不存在');
      }

      if (payload.extraData) {
        workOrder.extraData = { ...workOrder.extraData, ...payload.extraData };
        if (payload.extraData.employee_name) {
          workOrder.employeeName = this.validationService.requireText(payload.extraData.employee_name, 'employee_name');
        }
        if (payload.extraData.id_card_no) {
          workOrder.employeeIdCard = this.validationService.requireText(payload.extraData.id_card_no, 'id_card_no');
        }
        workOrder.customerCode = this.readText(workOrder.extraData.customer_code) ?? workOrder.customerCode;
        workOrder.branchCode = this.readText(workOrder.extraData.branch_code) ?? workOrder.branchCode;
        workOrder.customerName = this.readText(workOrder.extraData.customer_name) ?? workOrder.customerName;
      }

      const duplicate = await findDuplicateIdCardInMonth(workOrderRepo, {
        orderType: workOrder.orderType,
        employeeIdCard: workOrder.employeeIdCard,
        createdAt: workOrder.createdAt,
        excludeId: workOrder.id,
      });
      if (duplicate) {
        throwDuplicateIdCardConflict({ conflictOrderNo: duplicate.orderNo });
      }

      this.normalizeOnboardingSubmitFlags(workOrder.extraData);

      if (workOrder.status === WorkOrderStatus.PROCESSING || workOrder.status === WorkOrderStatus.COMPLETED || workOrder.status === WorkOrderStatus.WITHDRAWN) {
        throw businessException(4113, HttpStatus.CONFLICT, '重复提交');
      }
      if (workOrder.status !== WorkOrderStatus.DRAFT && workOrder.status !== WorkOrderStatus.RETURNED) {
        throw businessException(4114, HttpStatus.CONFLICT, '主工单非 returned 态，不能重新提交');
      }

      await this.validationService.validateWorkOrder(workOrder);
      const before = snapshotWorkOrder(workOrder);

      if (workOrder.status === WorkOrderStatus.RETURNED) {
        await this.resetReturnedChildren(dispatchedRepo, workOrder.id);
        workOrder.status = WorkOrderStatus.PROCESSING;
        workOrder.submittedAt = workOrder.submittedAt ?? new Date();
        await workOrderRepo.save(workOrder);
        await operationLogRepo.save(operationLogRepo.create({
          entityType: 'work_order',
          entityId: workOrder.id,
          userId: user.sub,
          actionType: 'resubmit_after_return',
          beforeData: before,
          afterData: snapshotWorkOrder(workOrder),
          ipAddress: null,
        }));
        return {
          workOrder: await this.loadDetail(workOrder.id),
          dispatchedOrders: toWorkOrderSubOrderItems(await dispatchedRepo.find({ where: { parentOrderId: workOrder.id }, relations: { handler: true } })),
        };
      }

      const childrenToCreate = this.dispatchEngineService
        ? (await this.dispatchEngineService.evaluateDetailed(workOrder, manager)).childrenToCreate
        : await buildOnboardingChildren(workOrder, manager, this.fieldPermissionService);
      if (childrenToCreate.length === 0) {
        throw businessException(4202, HttpStatus.BAD_REQUEST, '无可派发规则命中');
      }

      workOrder.status = WorkOrderStatus.PENDING;
      workOrder.submittedAt = new Date();
      await workOrderRepo.save(workOrder);

      const savedChildren = await dispatchedRepo.save(
        childrenToCreate.map((child) => dispatchedRepo.create({
          parentOrderId: workOrder.id,
          moduleCode: child.moduleCode,
          status: DispatchedOrderStatus.PENDING,
          handlerId: child.handlerId,
          visibleFields: child.visibleFields,
          returnReason: null,
          dispatchedAt: new Date(),
          dueAt: child.dueAt ?? null,
          slaHours: child.slaHours ?? null,
          slaReminderBeforeHours: child.slaReminderBeforeHours ?? null,
          acceptedAt: null,
          completedAt: null,
        })),
      );

      workOrder.status = WorkOrderStatus.PROCESSING;
      await workOrderRepo.save(workOrder);

      for (const child of savedChildren) {
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
        if (child.handlerId) {
          await notificationRepo.save(notificationRepo.create({
            userId: child.handlerId,
            bizType: 'dispatch',
            title: '新子工单待处理',
            content: `主工单 ${workOrder.orderNo} 分派到 ${child.moduleCode}`,
            link: `/dispatched-orders/${child.id}`,
            payload: { workOrderId: workOrder.id, dispatchedOrderId: child.id, moduleCode: child.moduleCode },
            isRead: false,
            readAt: null,
          }));
        }
      }

      await operationLogRepo.save(operationLogRepo.create({
        entityType: 'work_order',
        entityId: workOrder.id,
        userId: user.sub,
        actionType: 'submit',
        beforeData: before,
        afterData: snapshotWorkOrder(workOrder),
        ipAddress: null,
      }));

      const childrenWithHandlers = await dispatchedRepo.find({ where: { parentOrderId: workOrder.id }, relations: { handler: true } });
      return {
        workOrder: await this.loadDetail(workOrder.id),
        dispatchedOrders: toWorkOrderSubOrderItems(childrenWithHandlers.length > 0 ? childrenWithHandlers : savedChildren),
      };
    });
  }

  async withdraw(
    id: string,
    payload: WithdrawWorkOrderDto,
    user: JwtUserPayload,
  ): Promise<{ id: string; status: WorkOrderStatus.WITHDRAW_PENDING }> {
    return this.workOrderRepository.manager.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`work_order:withdraw:${id}`]);
      const workOrderRepo = manager.getRepository(WorkOrder);
      const dispatchedRepo = manager.getRepository(DispatchedOrder);
      const notificationRepo = manager.getRepository(Notification);
      const operationLogRepo = manager.getRepository(OperationLog);

      const workOrder = await workOrderRepo.findOne({ where: { id } });
      if (!workOrder) {
        throw businessException(4100, HttpStatus.NOT_FOUND, '工单不存在');
      }
      this.assertWithdrawRequester(workOrder, user);
      await this.assertMainOperationMovedToChildren(workOrder, user, '撤回', dispatchedRepo);
      this.assertCanRequestWithdraw(workOrder.status);

      const previousStatus = workOrder.status;
      const before = snapshotWorkOrder(workOrder);
      const reason = payload.reason?.trim() || null;
      workOrder.status = WorkOrderStatus.WITHDRAW_PENDING;
      await workOrderRepo.save(workOrder);

      await operationLogRepo.save(operationLogRepo.create({
        entityType: 'work_order',
        entityId: workOrder.id,
        userId: user.sub,
        actionType: 'withdraw_request',
        beforeData: before,
        afterData: {
          ...snapshotWorkOrder(workOrder),
          reason,
          previous_status: previousStatus,
          previousStatus,
          contextFields: {
            oldStatus: previousStatus,
            newStatus: workOrder.status,
            reason,
            previousStatus,
            previous_status: previousStatus,
          },
        },
        ipAddress: null,
      }));

      const activeChildren = await dispatchedRepo.find({
        where: { parentOrderId: workOrder.id },
      });
      const recipients = Array.from(new Set(activeChildren
        .filter((child) => child.status !== DispatchedOrderStatus.COMPLETED)
        .map((child) => child.handlerId)
        .filter((handlerId): handlerId is string => Boolean(handlerId))));
      for (const handlerId of recipients) {
        await notificationRepo.save(notificationRepo.create({
          userId: handlerId,
          bizType: 'withdraw_request',
          title: '工单撤回待审核',
          content: `工单 ${workOrder.orderNo} 发起撤回申请${reason ? `：${reason}` : ''}`,
          link: `/work-orders/${workOrder.id}`,
          payload: { workOrderId: workOrder.id, orderNo: workOrder.orderNo, reason, previousStatus },
          isRead: false,
          readAt: null,
        }));
      }

      return { id: workOrder.id, status: WorkOrderStatus.WITHDRAW_PENDING };
    });
  }

  async approveWithdraw(
    id: string,
    payload: WithdrawApproveWorkOrderDto,
    user: JwtUserPayload,
  ): Promise<{ id: string; status: WorkOrderStatus }> {
    return this.workOrderRepository.manager.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`work_order:withdraw:approve:${id}`]);
      const workOrderRepo = manager.getRepository(WorkOrder);
      const dispatchedRepo = manager.getRepository(DispatchedOrder);
      const notificationRepo = manager.getRepository(Notification);
      const operationLogRepo = manager.getRepository(OperationLog);
      const moduleHandlerRepo = manager.getRepository(ModuleHandler);
      const moduleSupervisorRepo = manager.getRepository(ModuleSupervisor);
      const userRoleRepo = manager.getRepository(UserRole);

      const workOrder = await workOrderRepo.findOne({ where: { id } });
      if (!workOrder) {
        throw businessException(4100, HttpStatus.NOT_FOUND, '工单不存在');
      }
      if (workOrder.status !== WorkOrderStatus.WITHDRAW_PENDING) {
        throw businessException(4119, HttpStatus.CONFLICT, '工单未处于撤回待审核状态');
      }

      const activeChildren = await dispatchedRepo.find({ where: { parentOrderId: workOrder.id } });
      await this.assertCanApproveWithdraw(activeChildren, user, moduleHandlerRepo, moduleSupervisorRepo, userRoleRepo);

      const before = snapshotWorkOrder(workOrder);
      const requestLog = await operationLogRepo.findOne({
        where: { entityType: 'work_order', entityId: workOrder.id, actionType: 'withdraw_request' },
        order: { createdAt: 'DESC' },
      });
      const previousStatus = this.readPreviousStatusFromWithdrawLog(requestLog);
      const comment = payload.comment?.trim() || null;

      workOrder.status = payload.approved ? WorkOrderStatus.WITHDRAWN : previousStatus;
      if (payload.approved) {
        workOrder.completedAt = workOrder.completedAt ?? new Date();
      }
      await workOrderRepo.save(workOrder);

      await operationLogRepo.save(operationLogRepo.create({
        entityType: 'work_order',
        entityId: workOrder.id,
        userId: user.sub,
        actionType: payload.approved ? 'withdraw_approved' : 'withdraw_rejected',
        beforeData: before,
        afterData: {
          ...snapshotWorkOrder(workOrder),
          approved: payload.approved,
          comment,
          previous_status: previousStatus,
          previousStatus,
          contextFields: {
            oldStatus: before.status,
            newStatus: workOrder.status,
            reason: comment,
            previousStatus,
            previous_status: previousStatus,
          },
        },
        ipAddress: null,
      }));

      await notificationRepo.save(notificationRepo.create({
        userId: workOrder.createdBy,
        bizType: payload.approved ? 'withdraw_approved' : 'withdraw_rejected',
        title: payload.approved ? '工单撤回已通过' : '工单撤回已拒绝',
        content: payload.approved
          ? `工单 ${workOrder.orderNo} 撤回申请已通过`
          : `工单 ${workOrder.orderNo} 撤回申请已拒绝${comment ? `：${comment}` : ''}`,
        link: `/work-orders/${workOrder.id}`,
        payload: { workOrderId: workOrder.id, orderNo: workOrder.orderNo, approved: payload.approved, comment, previousStatus },
        isRead: false,
        readAt: null,
      }));

      return { id: workOrder.id, status: workOrder.status };
    });
  }

  async urge(
    id: string,
    payload: UrgeWorkOrderDto,
    user: JwtUserPayload,
  ): Promise<{ ok: true; notifiedHandlers: number; lastUrgedAt: string }> {
    const workOrder = await this.loadWorkOrder(id);
    this.assertUrgeRequester(workOrder, user);
    await this.assertMainOperationMovedToChildren(workOrder, user, '催办');
    this.assertCanUrge(workOrder.status);

    const moduleCode = payload.moduleCode ?? payload.module_code ?? null;
    const children = await this.dispatchedOrderRepository.find({ where: { parentOrderId: workOrder.id } });
    const targetChildren = children.filter((child) => {
      if (child.status === DispatchedOrderStatus.COMPLETED || child.voidAt) return false;
      if (moduleCode && child.moduleCode !== moduleCode) return false;
      return Boolean(child.handlerId);
    });
    if (moduleCode && !children.some((child) => child.moduleCode === moduleCode)) {
      throw businessException(4200, HttpStatus.NOT_FOUND, '目标模块子工单不存在');
    }

    const throttleKey = moduleCode ?? '__all__';
    const threshold = new Date(Date.now() - 30 * 60 * 1000);
    const lastUrgeLog = await this.operationLogRepository.findOne({
      where: {
        entityType: 'work_order',
        entityId: workOrder.id,
        actionType: 'urge',
        createdAt: MoreThan(threshold),
      },
      order: { createdAt: 'DESC' },
    });
    if (lastUrgeLog && this.readUrgeModuleKey(lastUrgeLog) === throttleKey) {
      throw businessException(4290, HttpStatus.TOO_MANY_REQUESTS, '距上次催办未到 30 分钟');
    }

    const now = new Date();
    const recipientIds = Array.from(new Set(targetChildren
      .map((child) => child.handlerId)
      .filter((handlerId): handlerId is string => Boolean(handlerId))));
    const modules = Array.from(new Set(targetChildren.map((child) => child.moduleCode)));
    for (const handlerId of recipientIds) {
      await this.notificationRepository.save(this.notificationRepository.create({
        userId: handlerId,
        bizType: 'urge_received',
        title: '收到工单催办',
        content: `工单 ${workOrder.orderNo} 收到业务员催办`,
        link: `/work-orders/${workOrder.id}`,
        payload: { workOrderId: workOrder.id, orderNo: workOrder.orderNo, moduleCode, modules, urgedBy: user.sub, lastUrgedAt: now.toISOString() },
        isRead: false,
        readAt: null,
      }));
    }

    await this.writeOperationLog('work_order', workOrder.id, user.sub, 'urge', null, {
      workOrderId: workOrder.id,
      orderNo: workOrder.orderNo,
      moduleCode,
      module_code: moduleCode,
      moduleKey: throttleKey,
      modules,
      notifiedHandlers: recipientIds.length,
      notifiedHandlerIds: recipientIds,
      lastUrgedAt: now.toISOString(),
      payload: { moduleCode, moduleKey: throttleKey, lastUrgedAt: now.toISOString() },
    });

    return { ok: true, notifiedHandlers: recipientIds.length, lastUrgedAt: now.toISOString() };
  }

  async void(
    id: string,
    payload: VoidWorkOrderDto,
    user: JwtUserPayload,
  ): Promise<{ id: string; status: WorkOrderStatus.VOID_PENDING }> {
    return this.workOrderRepository.manager.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`work_order:void:${id}`]);
      const workOrderRepo = manager.getRepository(WorkOrder);
      const dispatchedRepo = manager.getRepository(DispatchedOrder);
      const notificationRepo = manager.getRepository(Notification);
      const operationLogRepo = manager.getRepository(OperationLog);

      const workOrder = await workOrderRepo.findOne({ where: { id } });
      if (!workOrder) {
        throw businessException(4100, HttpStatus.NOT_FOUND, '工单不存在');
      }
      this.assertVoidRequester(workOrder, user);
      await this.assertMainOperationMovedToChildren(workOrder, user, '作废', dispatchedRepo);
      this.assertCanRequestVoid(workOrder.status);

      const reason = payload.reason?.trim();
      if (!reason) {
        throw businessException(4122, HttpStatus.BAD_REQUEST, '作废原因必填');
      }

      const previousStatus = workOrder.status;
      const before = snapshotWorkOrder(workOrder);
      workOrder.status = WorkOrderStatus.VOID_PENDING;
      await workOrderRepo.save(workOrder);

      await operationLogRepo.save(operationLogRepo.create({
        entityType: 'work_order',
        entityId: workOrder.id,
        userId: user.sub,
        actionType: 'void_request',
        beforeData: before,
        afterData: {
          ...snapshotWorkOrder(workOrder),
          reason,
          previous_status: previousStatus,
          previousStatus,
          contextFields: {
            oldStatus: previousStatus,
            newStatus: workOrder.status,
            reason,
            previousStatus,
            previous_status: previousStatus,
          },
        },
        ipAddress: null,
      }));

      const activeChildren = await dispatchedRepo.find({ where: { parentOrderId: workOrder.id } });
      const recipients = Array.from(new Set(activeChildren
        .filter((child) => child.status !== DispatchedOrderStatus.COMPLETED)
        .map((child) => child.handlerId)
        .filter((handlerId): handlerId is string => Boolean(handlerId))));
      for (const handlerId of recipients) {
        await notificationRepo.save(notificationRepo.create({
          userId: handlerId,
          bizType: 'void_request',
          title: '工单作废待审核',
          content: `工单 ${workOrder.orderNo} 发起作废申请：${reason}`,
          link: `/work-orders/${workOrder.id}`,
          payload: { workOrderId: workOrder.id, orderNo: workOrder.orderNo, reason, previousStatus },
          isRead: false,
          readAt: null,
        }));
      }

      return { id: workOrder.id, status: WorkOrderStatus.VOID_PENDING };
    });
  }

  async approveVoid(
    id: string,
    payload: VoidApproveWorkOrderDto,
    user: JwtUserPayload,
  ): Promise<{ id: string; status: WorkOrderStatus }> {
    return this.workOrderRepository.manager.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`work_order:void:approve:${id}`]);
      const workOrderRepo = manager.getRepository(WorkOrder);
      const dispatchedRepo = manager.getRepository(DispatchedOrder);
      const notificationRepo = manager.getRepository(Notification);
      const operationLogRepo = manager.getRepository(OperationLog);
      const moduleHandlerRepo = manager.getRepository(ModuleHandler);
      const moduleSupervisorRepo = manager.getRepository(ModuleSupervisor);
      const userRoleRepo = manager.getRepository(UserRole);

      const workOrder = await workOrderRepo.findOne({ where: { id } });
      if (!workOrder) {
        throw businessException(4100, HttpStatus.NOT_FOUND, '工单不存在');
      }
      if (workOrder.status !== WorkOrderStatus.VOID_PENDING) {
        throw businessException(4124, HttpStatus.CONFLICT, '工单未处于作废待审核状态');
      }

      const activeChildren = await dispatchedRepo.find({ where: { parentOrderId: workOrder.id } });
      await this.assertCanApproveVoid(activeChildren, user, moduleHandlerRepo, moduleSupervisorRepo, userRoleRepo);

      const before = snapshotWorkOrder(workOrder);
      const requestLog = await operationLogRepo.findOne({
        where: { entityType: 'work_order', entityId: workOrder.id, actionType: 'void_request' },
        order: { createdAt: 'DESC' },
      });
      const previousStatus = this.readPreviousStatusFromVoidLog(requestLog);
      const comment = payload.comment?.trim() || null;
      const voidAt = new Date();

      workOrder.status = payload.approved ? WorkOrderStatus.VOID : previousStatus;
      if (payload.approved) {
        workOrder.completedAt = workOrder.completedAt ?? voidAt;
        for (const child of activeChildren) {
          if (child.status === DispatchedOrderStatus.COMPLETED) {
            continue;
          }
          child.voidAt = voidAt;
          await dispatchedRepo.save(child);
        }
      }
      await workOrderRepo.save(workOrder);

      await operationLogRepo.save(operationLogRepo.create({
        entityType: 'work_order',
        entityId: workOrder.id,
        userId: user.sub,
        actionType: payload.approved ? 'void_approved' : 'void_rejected',
        beforeData: before,
        afterData: {
          ...snapshotWorkOrder(workOrder),
          approved: payload.approved,
          comment,
          previous_status: previousStatus,
          previousStatus,
          contextFields: {
            oldStatus: before.status,
            newStatus: workOrder.status,
            reason: comment,
            previousStatus,
            previous_status: previousStatus,
          },
        },
        ipAddress: null,
      }));

      await notificationRepo.save(notificationRepo.create({
        userId: workOrder.createdBy,
        bizType: payload.approved ? 'void_approved' : 'void_rejected',
        title: payload.approved ? '工单作废已通过' : '工单作废已拒绝',
        content: payload.approved
          ? `工单 ${workOrder.orderNo} 作废申请已通过`
          : `工单 ${workOrder.orderNo} 作废申请已拒绝${comment ? `：${comment}` : ''}`,
        link: `/work-orders/${workOrder.id}`,
        payload: { workOrderId: workOrder.id, orderNo: workOrder.orderNo, approved: payload.approved, comment, previousStatus },
        isRead: false,
        readAt: null,
      }));

      return { id: workOrder.id, status: workOrder.status };
    });
  }

  async findAll(query: ListWorkOrderQueryDto, user: JwtUserPayload): Promise<PagedResponse<WorkOrderListItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.workOrderRepository.createQueryBuilder('w');

    if (!isAdminRole(user.roles)) {
      if (hasAnyRole(user.roles, BUSINESS_MANAGER_ROLES)) {
        const departmentIds = await this.validationService.resolveUserDepartmentIds(user.sub);
        if (departmentIds.length === 0) {
          return { items: [], total: 0, page, pageSize };
        }
        qb.andWhere('w.department_id IN (:...departmentIds)', { departmentIds });
      } else if (hasAnyRole(user.roles, BUSINESS_LEADER_ROLES)) {
        const departmentIds = await this.validationService.resolveUserDepartmentIds(user.sub);
        if (departmentIds.length === 0) {
          return { items: [], total: 0, page, pageSize };
        }
        qb.andWhere('w.department_id IN (:...departmentIds)', { departmentIds });
      } else {
        qb.andWhere('w.created_by = :userId', { userId: user.sub });
      }
    }

    const orderType = query.orderType ?? query.order_type;
    if (orderType) {
      qb.andWhere('w.order_type = :orderType', { orderType });
    }
    if (query.status) {
      qb.andWhere('w.status = :status', { status: query.status });
    }
    if (query.customerId) {
      qb.andWhere('w.customer_id = :customerId', { customerId: query.customerId });
    }
    if (query.createdAfter) {
      qb.andWhere('w.created_at >= :createdAfter', { createdAfter: query.createdAfter });
    }
    if (query.createdBefore) {
      qb.andWhere('w.created_at <= :createdBefore', { createdBefore: query.createdBefore });
    }
    if (query.keyword) {
      qb.andWhere('(w.employee_name ILIKE :keyword OR w.employee_id_card ILIKE :keyword OR w.order_no ILIKE :keyword)', {
        keyword: `%${query.keyword}%`,
      });
    }
    if (query.customerCode) {
      qb.andWhere("(w.customer_code ILIKE :customerCode OR w.extra_data->>'customer_code' ILIKE :customerCode)", { customerCode: `%${query.customerCode}%` });
    }
    if (query.customerName) {
      qb.andWhere("(w.customer_name ILIKE :customerName OR w.extra_data->>'customer_name' ILIKE :customerName)", { customerName: `%${query.customerName}%` });
    }
    if (query.employeeName) {
      qb.andWhere("(w.employee_name ILIKE :employeeName OR w.extra_data->>'employee_name' ILIKE :employeeName)", { employeeName: `%${query.employeeName}%` });
    }
    if (query.idCardNo) {
      qb.andWhere("(w.employee_id_card ILIKE :idCardNo OR w.extra_data->>'id_card_no' ILIKE :idCardNo OR w.extra_data->>'employee_id_card' ILIKE :idCardNo)", { idCardNo: `%${query.idCardNo}%` });
    }
    if (query.createdByName) {
      qb.leftJoin('w.creator', 'u').andWhere('u.real_name ILIKE :createdByName', {
        createdByName: `%${query.createdByName}%`,
      });
    }

    const total = await qb.getCount();
    const rows = await qb.orderBy('w.created_at', 'DESC').skip((page - 1) * pageSize).take(pageSize).getMany();
    const childrenByParentId = new Map<string, DispatchedOrder[]>();

    if (rows.length > 0) {
      const children = await this.dispatchedOrderRepository.find({
        where: { parentOrderId: In(rows.map((row) => row.id)) },
        relations: { handler: true },
      });

      for (const child of children) {
        const bucket = childrenByParentId.get(child.parentOrderId) ?? [];
        bucket.push(child);
        childrenByParentId.set(child.parentOrderId, bucket);
      }
    }

    const items = rows.map((row) => {
      const subOrders = toWorkOrderSubOrderItems(
        (childrenByParentId.get(row.id) ?? []).sort((a, b) => getModuleSortOrder(a.moduleCode) - getModuleSortOrder(b.moduleCode)),
      );
      return toWorkOrderListItem(row, subOrders);
    });

    return { items, total, page, pageSize };
  }

  async findOne(id: string, user: JwtUserPayload): Promise<WorkOrderDetailItem> {
    const workOrder = await this.loadWorkOrder(id);
    await this.assertReadable(workOrder, user);
    return this.loadDetail(id);
  }

  async timeline(id: string, user: JwtUserPayload): Promise<WorkOrderTimelineResponse> {
    const workOrder = await this.loadWorkOrder(id);
    await this.assertReadable(workOrder, user);

    const childIds = (await this.dispatchedOrderRepository.find({
      where: { parentOrderId: id },
      select: { id: true },
    })).map((child) => child.id);

    const where = childIds.length > 0
      ? [
        { entityType: 'work_order', entityId: id },
        { entityType: 'dispatched_order', entityId: In(childIds) },
      ]
      : [{ entityType: 'work_order', entityId: id }];

    const rows = await this.operationLogRepository.find({
      where,
      relations: { user: true },
      order: { createdAt: 'DESC' },
      take: 500,
    });
    const items = rows.map((row) => this.toTimelineItem(row));
    return {
      items,
      total: items.length,
      list: items,
      timeline: items,
    };
  }

  async resubmit(
    id: string,
    payload: SubmitWorkOrderDto,
    user: JwtUserPayload,
  ): Promise<{ workOrder: WorkOrderDetailItem; dispatchedOrders: WorkOrderSubOrderItem[] }> {
    this.assertBusinessOwnerReadOnly(user);
    if (!this.resubmitService) {
      throw businessException(1000, HttpStatus.INTERNAL_SERVER_ERROR, '重提服务未初始化');
    }
    return this.resubmitService.resubmit(id, payload, user);
  }

  async remove(id: string, user: JwtUserPayload): Promise<{ success: boolean; id: string }> {
    const workOrder = await this.loadWorkOrder(id);
    await this.workOrderRepository.delete(id);
    await this.writeOperationLog('work_order', id, user.sub, 'delete', snapshotWorkOrder(workOrder), { id, deleted: true });
    return { success: true, id };
  }

  async batchRemove(
    ids: string[],
    user: JwtUserPayload,
  ): Promise<{ success: boolean; deleted: number; skipped: Array<{ id: string; reason: string }> }> {
    const uniqueIds = Array.from(new Set(ids));
    const skipped: Array<{ id: string; reason: string }> = [];
    let deleted = 0;

    for (const id of uniqueIds) {
      try {
        await this.remove(id, user);
        deleted += 1;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        skipped.push({ id, reason });
      }
    }

    return { success: true, deleted, skipped };
  }

  async previewImport(payload: ImportPreviewDto): Promise<{
    headers: string[];
    suggestion: Record<string, string>;
    confidence: Record<string, number>;
    unmatched: string[];
  }> {
    const fields = payload.orderType
      ? await this.fieldConfigRepository
        .createQueryBuilder('field')
        .where('field.is_active = true')
        .andWhere(
          '(field.order_type = :orderType OR field.business_context @> :businessContext)',
          {
            orderType: payload.orderType,
            businessContext: JSON.stringify([payload.orderType]),
          },
        )
        .orderBy('field.display_order', 'ASC')
        .getMany()
      : await this.fieldConfigRepository.find({
        where: { isActive: true },
        order: { displayOrder: 'ASC' },
      });

    const suggestion: Record<string, string> = {};
    const confidence: Record<string, number> = {};
    const unmatched: string[] = [];

    for (const header of payload.headers) {
      const normalized = this.validationService.normalizeHeader(header);
      const matched = fields.find((field) => {
        const fieldName = this.validationService.normalizeHeader(field.fieldName);
        const fieldCode = this.validationService.normalizeHeader(field.fieldCode);
        return normalized === fieldName || normalized === fieldCode;
      });

      if (!matched) {
        unmatched.push(header);
        continue;
      }

      suggestion[header] = matched.fieldCode;
      confidence[header] = header === matched.fieldName ? 0.99 : 0.86;
    }

    return { headers: payload.headers, suggestion, confidence, unmatched };
  }

  async getImportJob(jobId: string, user: JwtUserPayload): Promise<ImportJob> {
    const job = await this.importJobRepository.findOne({ where: { id: jobId } });
    if (!job) {
      throw businessException(4400, HttpStatus.NOT_FOUND, '导入任务不存在');
    }
    if (job.userId !== user.sub && !user.roles.includes('admin')) {
      throw businessException(5000, HttpStatus.FORBIDDEN, '无权访问该资源');
    }
    return job;
  }

  private normalizeOnboardingSubmitFlags(extraData: Record<string, unknown>): void {
    const aliases: Record<string, string[]> = {
      need_onboarding_contact: [
        'need_onboarding_contact',
        '是否需要入职联系',
        '入职材料是否需要集约收集',
        '入职联系',
      ],
      need_company_contract: [
        'need_company_contract',
        '是否企服发起劳动合同',
        '企服发起劳动合同',
      ],
    };

    for (const [target, keys] of Object.entries(aliases)) {
      const found = keys
        .map((key) => extraData[key])
        .find((value) => value !== undefined && value !== null && String(value).trim() !== '');
      if (found !== undefined) {
        extraData[target] = this.isTruthyYes(found) ? '是' : String(found).trim();
      }
    }
  }

  private isTruthyYes(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    const text = String(value ?? '').trim().toLowerCase();
    return ['是', 'yes', 'y', 'true', '1'].includes(text);
  }

  private async loadWorkOrder(id: string): Promise<WorkOrder> {
    let workOrder: WorkOrder | null;
    try {
      workOrder = await this.workOrderRepository.findOne({ where: { id } });
    } catch (error) {
      this.rethrowInvalidIdAsNotFound(error, '工单不存在');
    }
    if (!workOrder) {
      throw new NotFoundException('工单不存在');
    }
    return workOrder;
  }

  private async loadDetail(id: string): Promise<WorkOrderDetailItem> {
    let workOrder: WorkOrder | null;
    try {
      workOrder = await this.workOrderRepository.findOne({
        where: { id },
        relations: { creator: true, department: true, customer: true, dispatchedOrders: { handler: true } },
      });
    } catch (error) {
      this.rethrowInvalidIdAsNotFound(error, '工单不存在');
    }
    if (!workOrder) {
      throw new NotFoundException('工单不存在');
    }

    const subOrders = toWorkOrderSubOrderItems(
      [...workOrder.dispatchedOrders].sort((a, b) => getModuleSortOrder(a.moduleCode) - getModuleSortOrder(b.moduleCode)),
    );

    return {
      id: workOrder.id,
      orderNo: workOrder.orderNo,
      order_no: workOrder.orderNo,
      orderType: workOrder.orderType,
      order_type: workOrder.orderType,
      status: workOrder.status,
      createdBy: { id: workOrder.creator.id, username: workOrder.creator.username, realName: workOrder.creator.realName },
      department: { id: workOrder.department.id, name: workOrder.department.name },
      customer: { id: workOrder.customer.id, customerCode: workOrder.customer.customerCode, customerName: workOrder.customer.customerName },
      employeeName: workOrder.employeeName,
      employee_name: workOrder.employeeName,
      employeeIdCard: workOrder.employeeIdCard,
      employee_id_card: workOrder.employeeIdCard,
      extraData: workOrder.extraData,
      extra_data: workOrder.extraData,
      dispatchedOrders: subOrders,
      subOrders,
      sub_orders: subOrders,
      submittedAt: workOrder.submittedAt,
      submitted_at: workOrder.submittedAt,
      completedAt: workOrder.completedAt,
      completed_at: workOrder.completedAt,
      createdAt: workOrder.createdAt,
      created_at: workOrder.createdAt,
      updatedAt: workOrder.updatedAt,
      updated_at: workOrder.updatedAt,
    };
  }


  private readText(value: unknown): string | null {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    return null;
  }

  private resolveOperatorName(user: OperationLog['user']): string | null {
    return this.readOperatorName(user?.realName) ?? this.readOperatorName(user?.username);
  }

  private readOperatorName(value: string | null | undefined): string | null {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    return null;
  }

  private toTimelineItem(log: OperationLog): WorkOrderTimelineItem {
    const actionCode = toOperationLogActionCode(log.entityType, log.actionType);
    const operatorName = this.resolveOperatorName(log.user);
    const contextFields = this.resolveTimelineContextFields(log, actionCode);
    return {
      id: log.id,
      createdAt: log.createdAt,
      created_at: log.createdAt,
      operatorId: log.userId,
      operator_id: log.userId,
      operatorName,
      operator_name: operatorName,
      userId: log.userId,
      user_id: log.userId,
      userName: operatorName,
      user_name: operatorName,
      entityType: log.entityType,
      entity_type: log.entityType,
      entityId: log.entityId,
      entity_id: log.entityId,
      entityLabel: humanizeEntityType(log.entityType),
      entity_label: humanizeEntityType(log.entityType),
      actionCode,
      action_code: actionCode,
      actionType: log.actionType,
      action_type: log.actionType,
      actionLabel: humanizeActionCode(actionCode),
      action_label: humanizeActionCode(actionCode),
      title: humanizeActionCode(actionCode),
      description: describeActionCode(actionCode),
      contextFields,
      context_fields: contextFields,
      beforeData: log.beforeData,
      before_data: log.beforeData,
      afterData: log.afterData,
      after_data: log.afterData,
    };
  }

  private resolveTimelineContextFields(log: OperationLog, actionCode: string): Record<string, unknown> {
    const beforeData = log.beforeData ?? {};
    const afterData = log.afterData ?? {};
    const explicit = this.readRecord(afterData.contextFields) ?? this.readRecord(beforeData.contextFields);
    const context: Record<string, unknown> = explicit ? { ...explicit } : {};

    const helperFields = getOperationLogContextFields(actionCode);
    for (const field of helperFields) {
      const value = this.readContextValue(field, beforeData, afterData);
      if (value !== undefined) {
        context[field] = value;
      }
    }

    if (context.oldStatus === undefined && beforeData.status !== undefined && beforeData.status !== afterData.status) {
      context.oldStatus = beforeData.status;
    }
    if (context.newStatus === undefined && afterData.status !== undefined && beforeData.status !== afterData.status) {
      context.newStatus = afterData.status;
    }
    if (context.fromUserId === undefined) {
      context.fromUserId = beforeData.handlerId ?? beforeData.previousHandlerId ?? null;
    }
    if (context.toUserId === undefined) {
      context.toUserId = afterData.handlerId ?? afterData.newHandlerId ?? null;
    }
    if (context.reason === undefined) {
      context.reason = afterData.reason ?? afterData.returnReason ?? null;
    }
    if (log.entityType === 'dispatched_order') {
      context.dispatchedOrderId = log.entityId;
      context.moduleCode = afterData.moduleCode ?? beforeData.moduleCode ?? context.moduleCode ?? null;
      context.parentOrderId = afterData.parentOrderId ?? beforeData.parentOrderId ?? context.parentOrderId ?? null;
    }
    return Object.fromEntries(Object.entries(context).filter(([, value]) => value !== undefined));
  }

  private readContextValue(field: string, beforeData: Record<string, unknown>, afterData: Record<string, unknown>): unknown {
    if (field === 'oldStatus') return beforeData.status;
    if (field === 'newStatus') return afterData.status;
    if (field === 'fromUserId') return beforeData.handlerId ?? beforeData.previousHandlerId;
    if (field === 'toUserId') return afterData.handlerId ?? afterData.newHandlerId;
    if (field === 'reason') return afterData.reason ?? afterData.returnReason;
    if (field === 'changedFields') return this.changedFields(beforeData, afterData);
    return afterData[field] ?? beforeData[field];
  }

  private changedFields(beforeData: Record<string, unknown>, afterData: Record<string, unknown>): string[] {
    const keys = new Set([...Object.keys(beforeData), ...Object.keys(afterData)]);
    return Array.from(keys).filter((key) => !this.valueEquals(beforeData[key], afterData[key]));
  }

  private readRecord(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }

  private assertSalesEditableFields(extraData: Record<string, unknown>): void {
    const handlerOwnedFields = new Set([
      'bank_account_no',
      'bank_card_no',
      'bank_name',
      'bank_branch',
      '银行卡卡号',
      '银行卡开户行',
      'contract_signed_at',
      'contract_no',
      'data_entry_status',
    ]);
    const denied = Object.keys(extraData).filter((key) => handlerOwnedFields.has(key));
    if (denied.length > 0) {
      throw businessException(4115, HttpStatus.FORBIDDEN, '不允许修改办理人字段', { fields: denied });
    }
  }

  private async syncDispatchedOrderSnapshots(parentOrderId: string): Promise<void> {
    const qb = this.dispatchedOrderRepository.createQueryBuilder?.();
    if (!qb || typeof qb.update !== 'function') {
      return;
    }
    await qb
      .update(DispatchedOrder)
      .set({ updatedAt: new Date() })
      .where('parent_order_id = :parentOrderId', { parentOrderId })
      .execute();
  }

  private async createDirtyMarksForSalesUpdate(
    workOrder: WorkOrder,
    beforeExtraData: Record<string, unknown>,
    afterExtraData: Record<string, unknown>,
    changedBy: string,
  ): Promise<void> {
    if (!this.dirtyMarkRepository) return;
    const changedFields = Object.keys(afterExtraData).filter((fieldCode) => !this.valueEquals(beforeExtraData[fieldCode], afterExtraData[fieldCode]));
    if (changedFields.length === 0) return;

    const children = await this.dispatchedOrderRepository.find({ where: { parentOrderId: workOrder.id } });
    const openChildren = children.filter((child) => child.status !== DispatchedOrderStatus.COMPLETED && child.status !== DispatchedOrderStatus.RETURNED);
    if (openChildren.length === 0) return;

    const fieldConfigs = await this.fieldConfigRepository.find({ where: { isActive: true } });
    const fieldNameMap = new Map(fieldConfigs.map((field) => [field.fieldCode, field.fieldName]));
    const moduleFieldRows = this.moduleFieldRepository
      ? await this.moduleFieldRepository.find({ where: { isActive: true } })
      : [];
    const modulesByField = new Map<string, Set<string>>();
    for (const row of moduleFieldRows) {
      if (!modulesByField.has(row.fieldCode)) modulesByField.set(row.fieldCode, new Set<string>());
      modulesByField.get(row.fieldCode)?.add(row.moduleCode);
    }

    const now = new Date();
    const dirtyRows: WorkOrderFieldDirtyMark[] = [];
    for (const fieldCode of changedFields) {
      const targetModules = modulesByField.get(fieldCode);
      const affectedChildren = targetModules && targetModules.size > 0
        ? openChildren.filter((child) => targetModules.has(child.moduleCode))
        : openChildren.filter((child) => !child.visibleFields || child.visibleFields.includes(fieldCode));
      for (const child of affectedChildren) {
        dirtyRows.push(this.dirtyMarkRepository.create({
          workOrderId: workOrder.id,
          dispatchedOrderId: child.id,
          moduleCode: child.moduleCode,
          fieldCode,
          fieldLabel: fieldNameMap.get(fieldCode) ?? fieldCode,
          oldValue: beforeExtraData[fieldCode] ?? null,
          newValue: afterExtraData[fieldCode] ?? null,
          changedBy,
          changedAt: now,
          flowRound: child.flowRound ?? workOrder.modificationRound ?? 0,
          isActive: true,
          clearedAt: null,
          clearedBy: null,
          clearReason: null,
        }));
      }
    }

    if (dirtyRows.length === 0) return;
    await this.dirtyMarkRepository.save(dirtyRows);
    await this.writeOperationLog('work_order', workOrder.id, changedBy, 'dirty_mark_created', null, {
      fields: changedFields,
      count: dirtyRows.length,
    });
  }

  private valueEquals(left: unknown, right: unknown): boolean {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  }

  private async resetReturnedChildren(repository: Repository<DispatchedOrder>, parentOrderId: string): Promise<void> {
    const children = await repository.find({ where: { parentOrderId } });
    for (const child of children) {
      if (child.status !== DispatchedOrderStatus.RETURNED) {
        continue;
      }
      child.status = DispatchedOrderStatus.PENDING;
      child.returnReason = null;
      child.dispatchedAt = new Date();
      child.dueAt = child.slaHours && child.slaHours > 0
        ? new Date(child.dispatchedAt.getTime() + child.slaHours * 60 * 60 * 1000)
        : null;
      await repository.save(child);
    }
  }

  private async assertMainOperationMovedToChildren(
    workOrder: WorkOrder,
    user: JwtUserPayload,
    actionLabel: string,
    repository: Repository<DispatchedOrder> = this.dispatchedOrderRepository,
  ): Promise<void> {
    if (isAdminRole(user.roles)) return;
    const childCount = await repository.count({ where: { parentOrderId: workOrder.id } });
    if (childCount === 0) return;
    throw businessException(4130, HttpStatus.CONFLICT, `该主工单已拆分为子工单，请到对应子工单中${actionLabel}，避免影响其他正常子工单`);
  }

  private assertWithdrawRequester(workOrder: WorkOrder, user: JwtUserPayload): void {
    if (isAdminRole(user.roles) || workOrder.createdBy === user.sub) {
      return;
    }
    throw new ForbiddenException('无权发起撤回');
  }

  private assertUrgeRequester(workOrder: WorkOrder, user: JwtUserPayload): void {
    if (isAdminRole(user.roles) || workOrder.createdBy === user.sub) {
      return;
    }
    throw new ForbiddenException('无权催办该工单');
  }

  private assertCanUrge(status: WorkOrderStatus): void {
    if ([WorkOrderStatus.VOID, WorkOrderStatus.VOID_PENDING, WorkOrderStatus.WITHDRAW_PENDING, WorkOrderStatus.WITHDRAWN, WorkOrderStatus.COMPLETED].includes(status)) {
      throw businessException(4126, HttpStatus.CONFLICT, '当前工单状态不可催办');
    }
  }

  private assertCanRequestWithdraw(status: WorkOrderStatus): void {
    if (status === WorkOrderStatus.WITHDRAW_PENDING) {
      throw businessException(4118, HttpStatus.CONFLICT, '撤回申请已提交，等待审核');
    }
    if ([WorkOrderStatus.COMPLETED, WorkOrderStatus.WITHDRAWN, WorkOrderStatus.VOID].includes(status)) {
      throw businessException(4117, HttpStatus.CONFLICT, '终态工单不可撤回');
    }
    if (![WorkOrderStatus.PENDING, WorkOrderStatus.PROCESSING, WorkOrderStatus.RETURNED].includes(status)) {
      throw businessException(4117, HttpStatus.CONFLICT, '当前状态不可撤回');
    }
  }

  private assertVoidRequester(workOrder: WorkOrder, user: JwtUserPayload): void {
    if (isAdminRole(user.roles) || workOrder.createdBy === user.sub) {
      return;
    }
    throw new ForbiddenException('无权发起作废');
  }

  private assertCanRequestVoid(status: WorkOrderStatus): void {
    if (status === WorkOrderStatus.VOID_PENDING) {
      throw businessException(4123, HttpStatus.CONFLICT, '作废申请已提交，等待审核');
    }
    if ([WorkOrderStatus.COMPLETED, WorkOrderStatus.WITHDRAWN, WorkOrderStatus.VOID].includes(status)) {
      throw businessException(4123, HttpStatus.CONFLICT, '终态工单不可作废');
    }
    if (![WorkOrderStatus.PENDING, WorkOrderStatus.PROCESSING, WorkOrderStatus.RETURNED, WorkOrderStatus.WITHDRAW_PENDING].includes(status)) {
      throw businessException(4123, HttpStatus.CONFLICT, '当前状态不可作废');
    }
  }

  private async assertCanApproveVoid(
    children: DispatchedOrder[],
    user: JwtUserPayload,
    moduleHandlerRepository: Repository<ModuleHandler>,
    moduleSupervisorRepository: Repository<ModuleSupervisor>,
    userRoleRepository: Repository<UserRole>,
  ): Promise<void> {
    if (isAdminRole(user.roles)) {
      return;
    }

    const activeChildren = children.filter((child) => child.status !== DispatchedOrderStatus.COMPLETED);
    if (activeChildren.some((child) => child.handlerId === user.sub)) {
      return;
    }

    for (const child of activeChildren) {
      if (await this.canActAsWithdrawModuleSupervisor(
        user,
        child.moduleCode,
        moduleHandlerRepository,
        moduleSupervisorRepository,
        userRoleRepository,
      )) {
        return;
      }
    }

    throw businessException(5000, HttpStatus.FORBIDDEN, '无权审核作废申请');
  }

  private async assertCanApproveWithdraw(
    children: DispatchedOrder[],
    user: JwtUserPayload,
    moduleHandlerRepository: Repository<ModuleHandler>,
    moduleSupervisorRepository: Repository<ModuleSupervisor>,
    userRoleRepository: Repository<UserRole>,
  ): Promise<void> {
    if (isAdminRole(user.roles)) {
      return;
    }

    const activeChildren = children.filter((child) => child.status !== DispatchedOrderStatus.COMPLETED);
    if (activeChildren.some((child) => child.handlerId === user.sub)) {
      return;
    }

    for (const child of activeChildren) {
      if (await this.canActAsWithdrawModuleSupervisor(
        user,
        child.moduleCode,
        moduleHandlerRepository,
        moduleSupervisorRepository,
        userRoleRepository,
      )) {
        return;
      }
    }

    throw businessException(5000, HttpStatus.FORBIDDEN, '无权审核撤回申请');
  }

  private async canActAsWithdrawModuleSupervisor(
    user: JwtUserPayload,
    moduleCode: string,
    moduleHandlerRepository: Repository<ModuleHandler>,
    moduleSupervisorRepository: Repository<ModuleSupervisor>,
    userRoleRepository: Repository<UserRole>,
  ): Promise<boolean> {
    if (hasAnyRole(user.roles, ['business_owner', 'manager', 'biz_manager'])) return false;
    if (await this.hasWithdrawModuleSupervisorConfig(user.sub, moduleCode, moduleSupervisorRepository)) return true;
    if (hasModuleSupervisorRole(user.roles) && (await this.hasWithdrawModuleAccess(user.sub, moduleCode, moduleHandlerRepository, moduleSupervisorRepository))) return true;
    return (await this.hasWithdrawSupervisorLevel(user.sub, userRoleRepository))
      && (await this.hasWithdrawModuleAccess(user.sub, moduleCode, moduleHandlerRepository, moduleSupervisorRepository));
  }

  private async hasWithdrawModuleSupervisorConfig(
    userId: string,
    moduleCode: string,
    moduleSupervisorRepository: Repository<ModuleSupervisor>,
  ): Promise<boolean> {
    const count = await moduleSupervisorRepository.count({ where: { supervisorId: userId, moduleCode, isActive: true } });
    return count > 0;
  }

  private async hasWithdrawSupervisorLevel(userId: string, userRoleRepository: Repository<UserRole>): Promise<boolean> {
    const rows = await userRoleRepository.find({ where: { userId }, relations: { role: true } });
    return rows.some((row) => [RoleLevel.SUPERVISOR, RoleLevel.MANAGEMENT, RoleLevel.GLOBAL].includes(row.role.level));
  }

  private async hasWithdrawModuleAccess(
    userId: string,
    moduleCode: string,
    moduleHandlerRepository: Repository<ModuleHandler>,
    moduleSupervisorRepository: Repository<ModuleSupervisor>,
  ): Promise<boolean> {
    const count = await moduleHandlerRepository.count({ where: { handlerId: userId, moduleCode, isActive: true } });
    if (count > 0) return true;
    return this.hasWithdrawModuleSupervisorConfig(userId, moduleCode, moduleSupervisorRepository);
  }

  private readPreviousStatusFromWithdrawLog(log: OperationLog | null): WorkOrderStatus {
    const previousStatus = this.readPreviousStatusFromOperationLog(log);
    if (this.isRollbackWorkOrderStatus(previousStatus)) {
      return previousStatus;
    }
    throw businessException(4121, HttpStatus.CONFLICT, '撤回申请缺少可回滚状态');
  }

  private readPreviousStatusFromVoidLog(log: OperationLog | null): WorkOrderStatus {
    const previousStatus = this.readPreviousStatusFromOperationLog(log);
    if (this.isVoidRollbackWorkOrderStatus(previousStatus)) {
      return previousStatus;
    }
    throw businessException(4125, HttpStatus.CONFLICT, '作废申请缺少可回滚状态');
  }

  private readPreviousStatusFromOperationLog(log: OperationLog | null): unknown {
    const afterData = this.readRecord(log?.afterData) ?? {};
    const contextFields = this.readRecord(afterData.contextFields) ?? {};
    return afterData.previous_status ?? afterData.previousStatus ?? contextFields.previous_status ?? contextFields.previousStatus;
  }

  private readUrgeModuleKey(log: OperationLog): string {
    const afterData = this.readRecord(log.afterData) ?? {};
    const payload = this.readRecord(afterData.payload) ?? {};
    const moduleKey = afterData.moduleKey ?? payload.moduleKey;
    if (typeof moduleKey === 'string' && moduleKey.length > 0) return moduleKey;
    const moduleCode = afterData.moduleCode ?? afterData.module_code ?? payload.moduleCode;
    return typeof moduleCode === 'string' && moduleCode.length > 0 ? moduleCode : '__all__';
  }

  private isRollbackWorkOrderStatus(value: unknown): value is WorkOrderStatus {
    return value === WorkOrderStatus.PENDING || value === WorkOrderStatus.PROCESSING || value === WorkOrderStatus.RETURNED;
  }

  private isVoidRollbackWorkOrderStatus(value: unknown): value is WorkOrderStatus {
    return this.isRollbackWorkOrderStatus(value) || value === WorkOrderStatus.WITHDRAW_PENDING;
  }

  private assertOwner(workOrder: WorkOrder, userId: string): void {
    if (workOrder.createdBy !== userId) {
      throw new ForbiddenException('无权访问该资源');
    }
  }

  private async assertReadable(workOrder: WorkOrder, user: JwtUserPayload): Promise<void> {
    if (isAdminRole(user.roles) || workOrder.createdBy === user.sub) {
      return;
    }

    if (hasAnyRole(user.roles, BUSINESS_MANAGER_ROLES)) {
      const departmentIds = await this.validationService.resolveUserDepartmentIds(user.sub);
      if (departmentIds.includes(workOrder.departmentId)) {
        return;
      }
    }

    if (hasAnyRole(user.roles, BUSINESS_LEADER_ROLES)) {
      const departmentIds = await this.validationService.resolveUserDepartmentIds(user.sub);
      if (departmentIds.includes(workOrder.departmentId)) {
        return;
      }
    }

    // 检查是否为子工单办理人
    const children = await this.dispatchedOrderRepository.find({
      where: { parentOrderId: workOrder.id },
      select: { handlerId: true },
    });
    if (children.some((child) => child.handlerId === user.sub)) {
      return;
    }

    throw new ForbiddenException('无权访问该资源');
  }

  private assertBusinessOwnerReadOnly(user: JwtUserPayload): void {
    if (hasAnyRole(user.roles, BUSINESS_MANAGER_ROLES) && !isAdminRole(user.roles)) {
      throw businessException(5000, HttpStatus.FORBIDDEN, '业务负责人仅可查看工单，不可执行办理操作');
    }
  }

  private rethrowInvalidIdAsNotFound(error: unknown, message: string): never {
    const driverError = error instanceof QueryFailedError ? (error.driverError as { code?: string } | undefined) : undefined;
    if (driverError?.code === '22P02') {
      throw new NotFoundException(message);
    }
    throw error;
  }

  private async writeOperationLog(
    entityType: string,
    entityId: string,
    userId: string,
    actionType: string,
    beforeData: Record<string, unknown> | null,
    afterData: Record<string, unknown>,
  ): Promise<void> {
    await this.operationLogRepository.save(this.operationLogRepository.create({
      entityType,
      entityId,
      userId,
      actionType,
      beforeData,
      afterData,
      ipAddress: null,
    }));
  }
}
