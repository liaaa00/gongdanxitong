import { ForbiddenException, HttpStatus, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, QueryFailedError, Repository, SelectQueryBuilder } from 'typeorm';
import { hasAnyRole, hasManagementScopeRole, hasModuleSupervisorRole, isAdminRole } from 'src/common/auth/role-permissions';
import { businessException } from 'src/common/exceptions/business-exception';
import {
  DispatchedOrder,
  DispatchedOrderReturnRecord,
  DispatchedOrderStatus,
  FieldConfig,
  FieldPermissionMode,
  ModuleHandler,
  ModuleSupervisor,
  Notification,
  OperationLog,
  OrderStage,
  OrderType,
  RoleLevel,
  UserRole,
  WorkOrder,
  WorkOrderFieldDirtyMark,
  WorkOrderStatus,
} from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { ExportTemplatesService } from 'src/modules/admin/export-templates/export-templates.service';
import { FieldPermissionService } from 'src/modules/field-permissions/field-permission.service';
import { FieldSupplementService } from 'src/modules/field-supplement/field-supplement.service';
import { FieldChangeHook } from 'src/modules/notifications/field-change.hook';
import { AcceptDispatchedOrderDto } from './dto/accept.dto';
import { BatchCompleteDispatchedOrderDto } from './dto/batch-complete.dto';
import { BenefitStageCode, BenefitTransitionDto } from './dto/benefit-transition.dto';
import { CompleteDispatchedOrderDto } from './dto/complete.dto';
import { ExportDispatchedOrderDto } from './dto/export.dto';
import { ListDispatchedOrderQueryDto } from './dto/list-query.dto';
import { ReassignDispatchedOrderDto } from './dto/reassign.dto';
import { ReturnDispatchedOrderDto } from './dto/return.dto';
import { SupplementFieldDto } from './dto/supplement.dto';
import {
  DispatchedOrderDetailItem,
  DispatchedOrderExportResult,
  DispatchedOrderListItem,
  PagedResponse,
} from './dispatched-order.types';

@Injectable()
export class DispatchedOrderService {
  constructor(
    @InjectRepository(DispatchedOrder)
    private readonly dispatchedOrderRepository: Repository<DispatchedOrder>,
    @InjectRepository(WorkOrder)
    private readonly workOrderRepository: Repository<WorkOrder>,
    @InjectRepository(ModuleHandler)
    private readonly moduleHandlerRepository: Repository<ModuleHandler>,
    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,
    @InjectRepository(FieldConfig)
    private readonly fieldConfigRepository: Repository<FieldConfig>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(OperationLog)
    private readonly operationLogRepository: Repository<OperationLog>,
    private readonly fieldPermissionService: FieldPermissionService,
    private readonly fieldSupplementService: FieldSupplementService,
    private readonly exportTemplatesService: ExportTemplatesService,
    @Optional()
    @InjectRepository(OrderStage)
    private readonly orderStageRepository?: Repository<OrderStage>,
    private readonly fieldChangeHook?: FieldChangeHook,
    @Optional()
    @InjectRepository(WorkOrderFieldDirtyMark)
    private readonly dirtyMarkRepository?: Repository<WorkOrderFieldDirtyMark>,
    @Optional()
    @InjectRepository(ModuleSupervisor)
    private readonly moduleSupervisorRepository?: Repository<ModuleSupervisor>,
    @Optional()
    @InjectRepository(DispatchedOrderReturnRecord)
    private readonly returnRecordRepository?: Repository<DispatchedOrderReturnRecord>,
  ) {}

  async findAll(
    query: ListDispatchedOrderQueryDto,
    user: JwtUserPayload,
  ): Promise<PagedResponse<DispatchedOrderListItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.baseListQuery();

    await this.applyUserScope(qb, user, query.onlyPool === true || query.onlyUnclaimed === true);
    this.applyCommonFilters(qb, { ...query, __currentUserId: user.sub } as ListDispatchedOrderQueryDto & { __currentUserId: string });

    const [rows, total] = await qb
      .orderBy('d.createdAt', 'DESC')
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .getManyAndCount();
    return { items: rows.map((row) => this.toListItem(row)), total, page, pageSize };
  }

  async findTeam(
    moduleCode: string,
    query: ListDispatchedOrderQueryDto,
    user: JwtUserPayload,
  ): Promise<PagedResponse<DispatchedOrderListItem>> {
    await this.assertCanViewTeam(user, moduleCode);
    return this.findAll({ ...query, moduleCode }, { ...user, roles: this.ensureAdminScope(user.roles) });
  }

  async listModuleMembers(moduleCode: string, user: JwtUserPayload): Promise<Array<{
    id: string;
    username: string;
    realName: string;
    real_name: string;
    nodeType: string;
    node_type: string;
    handlerRole: string;
    handler_role: string;
    position: string;
    isBackup: boolean;
    is_backup: boolean;
    weight: number;
    isActive: boolean;
    is_active: boolean;
    isOnDuty: boolean;
    is_on_duty: boolean;
  }>> {
    await this.assertModulePoolAccess(user, moduleCode);
    const handlers = await this.moduleHandlerRepository.find({
      where: { moduleCode, isActive: true },
      relations: { handler: true },
      order: { isBackup: 'ASC', weight: 'DESC' },
    });
    if (handlers.length === 0) return [];
    return handlers
      .map((handler) => {
        const member = handler.handler;
        if (!member || !member.isActive) return null;
        const handlerRole = handler.isBackup ? 'backup_handler' : 'primary_handler';
        return {
          id: member.id,
          username: member.username,
          realName: member.realName,
          real_name: member.realName,
          nodeType: moduleCode,
          node_type: moduleCode,
          handlerRole,
          handler_role: handlerRole,
          position: handlerRole,
          isBackup: handler.isBackup,
          is_backup: handler.isBackup,
          weight: handler.weight,
          isActive: member.isActive,
          is_active: member.isActive,
          isOnDuty: member.isActive,
          is_on_duty: member.isActive,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }

  async findOne(id: string, user: JwtUserPayload): Promise<DispatchedOrderDetailItem> {
    const order = await this.loadDispatchedOrder(id);
    await this.assertCanRead(order, user);
    const clearedDirtyCount = await this.clearDirtyMarksForDispatchedOrder(order, user, 'owner_open_detail');
    return this.toDetailItem(order, clearedDirtyCount);
  }

  async accept(
    id: string,
    _payload: AcceptDispatchedOrderDto,
    user: JwtUserPayload,
  ): Promise<DispatchedOrderDetailItem> {
    const order = await this.loadDispatchedOrder(id);
    if (order.status !== DispatchedOrderStatus.PENDING) {
      throw businessException(4201, HttpStatus.CONFLICT, '子工单状态不允许接单');
    }
    if (order.handlerId && order.handlerId !== user.sub && !this.isAdmin(user)) {
      throw businessException(4220, HttpStatus.CONFLICT, '接单失败：已分配给他人');
    }
    if (!order.handlerId) {
      await this.assertModulePoolAccess(user, order.moduleCode);
    }

    const handlerId = this.isAdmin(user) && order.handlerId ? order.handlerId : user.sub;
    const result = await this.dispatchedOrderRepository
      .createQueryBuilder()
      .update(DispatchedOrder)
      .set({ status: DispatchedOrderStatus.PROCESSING, handlerId, acceptedAt: new Date() })
      .where('id = :id', { id })
      .andWhere('status = :status', { status: DispatchedOrderStatus.PENDING })
      .andWhere('(handler_id IS NULL OR handler_id = :handlerId)', { handlerId })
      .execute();

    if (result.affected !== 1) {
      throw businessException(4220, HttpStatus.CONFLICT, '接单失败：状态已变化');
    }

    await this.writeLog('dispatched_order', id, user.sub, 'accept', this.snapshot(order), { handlerId });
    return this.findOne(id, user);
  }

  async claim(id: string, user: JwtUserPayload): Promise<DispatchedOrderDetailItem> {
    const order = await this.loadDispatchedOrder(id);
    if (order.handlerId) {
      throw businessException(4220, HttpStatus.CONFLICT, '认领失败：已被认领');
    }
    await this.assertModulePoolAccess(user, order.moduleCode);

    const result = await this.dispatchedOrderRepository
      .createQueryBuilder()
      .update(DispatchedOrder)
      .set({ handlerId: user.sub, status: DispatchedOrderStatus.PROCESSING, acceptedAt: new Date() })
      .where('id = :id', { id })
      .andWhere('handler_id IS NULL')
      .returning(['id'])
      .execute();

    if (result.affected !== 1) {
      throw businessException(4220, HttpStatus.CONFLICT, '认领失败：已被他人认领');
    }

    await this.writeLog('dispatched_order', id, user.sub, 'claim', this.snapshot(order), { handlerId: user.sub });
    return this.findOne(id, user);
  }

  async complete(
    id: string,
    payload: CompleteDispatchedOrderDto,
    user: JwtUserPayload,
  ): Promise<DispatchedOrderDetailItem> {
    const order = await this.loadDispatchedOrder(id);
    this.assertNotVoidedForHandling(order);
    await this.assertCanHandle(order, user);
    const remark = payload.remark?.trim() ?? '';
    if (order.moduleCode === 'social_insurance' && remark.length === 0) {
      throw businessException(4223, HttpStatus.BAD_REQUEST, '社保公积金办理完成备注必填，请填写月份、基数、操作类型等追溯信息');
    }

    const result = await this.dispatchedOrderRepository
      .createQueryBuilder()
      .update(DispatchedOrder)
      .set({ status: DispatchedOrderStatus.COMPLETED, completedAt: new Date(), completionRemark: remark || null })
      .where('id = :id', { id })
      .andWhere('status = :status', { status: DispatchedOrderStatus.PROCESSING })
      .execute();

    if (result.affected !== 1) {
      throw businessException(4201, HttpStatus.CONFLICT, '完成失败：子工单状态不允许该操作');
    }

    if (payload.extraData && Object.keys(payload.extraData).length > 0) {
      const beforeExtraData = { ...order.parentOrder.extraData };
      order.parentOrder.extraData = { ...order.parentOrder.extraData, ...payload.extraData };
      await this.workOrderRepository.save(order.parentOrder);
      if (this.fieldChangeHook) {
        await this.fieldChangeHook.onWorkOrderUpdated({
          orderId: order.parentOrder.id,
          actorUserId: user.sub,
          diff: this.fieldChangeHook.buildDiff(beforeExtraData, order.parentOrder.extraData),
          bizType: 'order.field_changed',
        });
      }
    }

    await this.checkMainOrderComplete(order.parentOrderId);
    await this.writeLog('dispatched_order', id, user.sub, 'complete', this.snapshot(order), payload.extraData ?? {});
    return this.findOne(id, user);
  }

  async returnOrder(
    id: string,
    payload: ReturnDispatchedOrderDto,
    user: JwtUserPayload,
  ): Promise<DispatchedOrderDetailItem> {
    const order = await this.loadDispatchedOrder(id);
    const reason = payload.returnReason?.trim();
    if (!reason) {
      throw businessException(4222, HttpStatus.BAD_REQUEST, '退回失败：退回原因必填');
    }
    if (order.status === DispatchedOrderStatus.COMPLETED) {
      await this.assertCanReturnCompleted(order, user);
    } else {
      await this.assertCanHandle(order, user);
    }

    const beforeSnapshot = this.snapshot(order);
    const beforeStatus = order.status;
    order.status = DispatchedOrderStatus.RETURNED;
    order.returnReason = reason;
    order.completedAt = null;
    await this.dispatchedOrderRepository.save(order);

    order.parentOrder.status = WorkOrderStatus.RETURNED;
    order.parentOrder.completedAt = null;
    await this.workOrderRepository.save(order.parentOrder);
    if (this.returnRecordRepository) {
      await this.returnRecordRepository.save(this.returnRecordRepository.create({
        workOrderId: order.parentOrderId,
        dispatchedOrderId: order.id,
        moduleCode: order.moduleCode,
        returnedBy: user.sub,
        returnReason: reason,
        beforeStatus,
        afterStatus: DispatchedOrderStatus.RETURNED,
        payload: { returnedFields: payload.returnedFields ?? [] },
      }));
    }
    await this.notifyCreator(order, 'dispatched_returned', '子工单已退回', reason);
    await this.writeLog('dispatched_order', id, user.sub, beforeStatus === DispatchedOrderStatus.COMPLETED ? 'return_completed' : 'return', beforeSnapshot, { returnReason: reason, returnedFields: payload.returnedFields ?? [] });

    return this.findOne(id, user);
  }

  async batchComplete(
    payload: BatchCompleteDispatchedOrderDto,
    user: JwtUserPayload,
  ): Promise<{ success: boolean; completed: number; skipped: Array<{ id: string; reason: string }> }> {
    const remark = payload.remark?.trim();
    if (!remark) {
      throw businessException(4223, HttpStatus.BAD_REQUEST, '批量完成备注必填');
    }

    const skipped: Array<{ id: string; reason: string }> = [];
    let completed = 0;
    const uniqueIds = Array.from(new Set(payload.ids));
    for (const id of uniqueIds) {
      try {
        await this.complete(id, { remark, extraData: payload.extraData }, user);
        completed += 1;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        skipped.push({ id, reason });
      }
    }

    return { success: true, completed, skipped };
  }

  async batchCompleteSocialInsurance(
    payload: BatchCompleteDispatchedOrderDto,
    user: JwtUserPayload,
  ): Promise<{ success: boolean; completed: number; skipped: Array<{ id: string; reason: string }> }> {
    const remark = payload.remark?.trim();
    if (!remark) {
      throw businessException(4223, HttpStatus.BAD_REQUEST, '社保批量完成备注必填，请填写月份、基数、操作类型等追溯信息');
    }

    const skipped: Array<{ id: string; reason: string }> = [];
    let completed = 0;
    const uniqueIds = Array.from(new Set(payload.ids));
    for (const id of uniqueIds) {
      const order = await this.loadDispatchedOrder(id);
      if (order.moduleCode !== 'social_insurance') {
        skipped.push({ id, reason: '仅支持社保公积金办理子单' });
        continue;
      }
      if (order.status !== DispatchedOrderStatus.PROCESSING && order.status !== DispatchedOrderStatus.PENDING) {
        skipped.push({ id, reason: '子单状态不允许完成' });
        continue;
      }
      await this.assertCanHandle(order, user);
      order.status = DispatchedOrderStatus.COMPLETED;
      order.completedAt = new Date();
      order.completionRemark = remark;
      await this.dispatchedOrderRepository.save(order);
      await this.checkMainOrderComplete(order.parentOrderId);
      await this.writeLog('dispatched_order', id, user.sub, 'social_insurance_batch_complete', this.snapshot(order), { remark });
      completed += 1;
    }

    return { success: true, completed, skipped };
  }

  async supplement(
    id: string,
    payload: SupplementFieldDto,
    user: JwtUserPayload,
  ): Promise<{ success: boolean; workOrderId: string; fieldCode: string } | { success: boolean; workOrderId: string; fieldCode: string[] }> {
    const order = await this.loadDispatchedOrder(id);
    await this.assertCanHandle(order, user);
    const fields: Array<[string, unknown]> = payload.fields ? Object.entries(payload.fields) : (payload.fieldCode ? [[payload.fieldCode, payload.newValue]] : []);
    if (fields.length === 0) {
      throw businessException(4301, HttpStatus.BAD_REQUEST, '至少提供一个可补充字段');
    }
    const results = [] as Array<{ success: boolean; workOrderId: string; fieldCode: string }>;
    for (const [fieldCode, newValue] of fields) {
      results.push(await this.fieldSupplementService.supplement({ dispatchedOrderId: id, fieldCode, newValue, userId: user.sub, workOrderUpdatedAt: payload.workOrderUpdatedAt }));
    }
    return results.length === 1 ? results[0] : { success: true, workOrderId: results[0].workOrderId, fieldCode: results.map((item) => item.fieldCode) };
  }

  async getSupplementLogs(id: string, user: JwtUserPayload): Promise<Array<{ fieldCode: string; oldValue: string | null; newValue: string | null; supplementedById: string; supplementedAt: Date }>> {
    const order = await this.loadDispatchedOrder(id);
    await this.assertCanRead(order, user);
    return this.fieldSupplementService.getLogs(id);
  }

  async confirmDirtyRead(id: string, user: JwtUserPayload): Promise<{ success: boolean; cleared: number }> {
    const order = await this.loadDispatchedOrder(id);
    await this.assertCanRead(order, user);
    const cleared = await this.clearDirtyMarksForDispatchedOrder(order, user, 'confirm_read');
    return { success: true, cleared };
  }

  async reassign(
    id: string,
    payload: ReassignDispatchedOrderDto,
    user: JwtUserPayload,
  ): Promise<DispatchedOrderDetailItem> {
    const order = await this.loadDispatchedOrder(id);
    await this.assertCanViewTeam(user, order.moduleCode);
    const newHandlerId = payload.newHandlerId ?? payload.new_handler_id ?? payload.handlerId ?? payload.handler_id;
    if (!newHandlerId) {
      throw businessException(4220, HttpStatus.BAD_REQUEST, 'reassign requires newHandlerId');
    }
    const handler = await this.moduleHandlerRepository.findOne({
      where: { moduleCode: order.moduleCode, handlerId: newHandlerId, isActive: true },
    });
    if (!handler) {
      throw businessException(4220, HttpStatus.BAD_REQUEST, '重新分派失败：处理人未配置在该模块');
    }

    const before = this.snapshot(order);
    const previousHandlerId = order.handlerId;
    await this.dispatchedOrderRepository.update(id, {
      handlerId: newHandlerId,
      status: DispatchedOrderStatus.PENDING,
      acceptedAt: null,
    });
    order.handlerId = newHandlerId;
    order.handler = null;
    order.status = DispatchedOrderStatus.PENDING;
    order.acceptedAt = null;
    await this.writeLog('dispatched_order', id, user.sub, 'reassign', before, {
      previousHandlerId,
      newHandlerId,
      reason: payload.reason?.trim() || null,
      reassignedAt: new Date().toISOString(),
    });
    await this.notificationRepository.save(this.notificationRepository.create({
      userId: newHandlerId,
      bizType: 'dispatch_reassign',
      title: '子工单已转交',
      content: payload.reason?.trim() || `主工单 ${order.parentOrder.orderNo} 已转交至 ${order.moduleCode}`,
      link: `/dispatched-orders/${order.id}`,
      payload: { workOrderId: order.parentOrderId, dispatchedOrderId: order.id, moduleCode: order.moduleCode, previousHandlerId },
      isRead: false,
      readAt: null,
    }));
    const refreshed = await this.loadDispatchedOrder(id);
    return this.toDetailItem(refreshed);
  }

  async transitionBenefitStage(
    id: string,
    payload: BenefitTransitionDto,
    user: JwtUserPayload,
  ): Promise<{ success: boolean; dispatchedOrderId: string; previousStage: string; currentStage: BenefitStageCode }> {
    if (!this.orderStageRepository) {
      throw businessException(1000, HttpStatus.INTERNAL_SERVER_ERROR, 'OrderStage repository is not ready');
    }

    const order = await this.loadDispatchedOrder(id);
    await this.assertCanHandle(order, user);
    if (order.parentOrder.orderType !== OrderType.BENEFIT) {
      throw businessException(4230, HttpStatus.BAD_REQUEST, 'benefit stage transition only supports benefit work orders');
    }

    const latest = await this.orderStageRepository.findOne({
      where: { dispatchedOrderId: id },
      order: { happenedAt: 'DESC', createdAt: 'DESC' },
    });
    const previousStage = latest?.stageCode ?? 'draft';
    this.assertBenefitTransition(previousStage, payload.nextStage);

    const nextRow = await this.orderStageRepository.save(this.orderStageRepository.create({
      workOrderId: order.parentOrderId,
      dispatchedOrderId: id,
      stageCode: payload.nextStage,
      stageName: this.benefitStageName(payload.nextStage),
      stageStatus: payload.nextStage === 'returned' ? 'returned' : 'done',
      happenedAt: new Date(),
      operatorId: user.sub,
      payload: payload.payload ?? null,
    }));

    order.parentOrder.extraData = {
      ...order.parentOrder.extraData,
      benefit_stage: payload.nextStage,
      benefit_stage_updated_at: nextRow.happenedAt.toISOString(),
    };
    await this.workOrderRepository.save(order.parentOrder);
    await this.writeLog('dispatched_order', id, user.sub, 'benefit_stage_transition', { previousStage }, { currentStage: payload.nextStage, payload: payload.payload ?? null });

    return { success: true, dispatchedOrderId: id, previousStage, currentStage: payload.nextStage };
  }

  async exportOrder(
    id: string,
    payload: ExportDispatchedOrderDto,
    user: JwtUserPayload,
  ): Promise<DispatchedOrderExportResult> {
    const order = await this.loadDispatchedOrder(id);
    await this.assertCanRead(order, user);
    return this.exportTemplatesService.exportSingleDispatchedOrder(id, payload.templateId, user);
  }

  async remove(id: string, user: JwtUserPayload): Promise<{ success: boolean; id: string }> {
    const order = await this.loadDispatchedOrder(id);
    await this.dispatchedOrderRepository.delete(id);
    await this.writeLog('dispatched_order', id, user.sub, 'delete', this.snapshot(order), { deleted: true });
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

  private assertBenefitTransition(previousStage: string, nextStage: BenefitStageCode): void {
    const allowed: Record<string, BenefitStageCode[]> = {
      draft: ['submitted'],
      submitted: ['under_review'],
      under_review: ['returned', 'pending_stamp'],
      returned: ['submitted', 'under_review'],
      pending_stamp: ['stamped'],
      stamped: ['materials_received'],
      materials_received: ['offline_filing'],
      offline_filing: ['stage_feedback'],
      stage_feedback: [],
    };
    const next = allowed[previousStage] ?? [];
    if (!next.includes(nextStage)) {
      throw businessException(4231, HttpStatus.CONFLICT, `invalid benefit stage transition: ${previousStage} -> ${nextStage}`);
    }
  }

  private benefitStageName(stage: BenefitStageCode): string {
    const names: Record<BenefitStageCode, string> = {
      submitted: 'submitted',
      under_review: 'under_review',
      returned: 'returned',
      pending_stamp: 'pending_stamp',
      stamped: 'stamped',
      materials_received: 'materials_received',
      offline_filing: 'offline_filing',
      stage_feedback: 'stage_feedback',
    };
    return names[stage];
  }

  private baseListQuery(): SelectQueryBuilder<DispatchedOrder> {
    return this.dispatchedOrderRepository
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.parentOrder', 'w')
      .leftJoinAndSelect('d.handler', 'h');
  }

  private async applyUserScope(
    qb: SelectQueryBuilder<DispatchedOrder>,
    user: JwtUserPayload,
    onlyPool: boolean,
  ): Promise<void> {
    if (this.isAdmin(user)) {
      if (onlyPool) qb.andWhere('d.handler_id IS NULL');
      return;
    }
    const modules = await this.getAccessibleModules(user.sub);
    const canSeeModuleAll = hasManagementScopeRole(user.roles) || hasModuleSupervisorRole(user.roles) || (await this.hasSupervisorLevel(user.sub));
    qb.andWhere(new Brackets((scope) => {
      if (!onlyPool) {
        scope.where('d.handler_id = :userId', { userId: user.sub });
      } else {
        scope.where('1 = 0');
      }
      if (modules.length > 0) {
        if (canSeeModuleAll && !onlyPool) {
          // Module supervisors (for example 江璐 as shared_team_owner) must see every child order in their modules,
          // including orders already assigned to 杨纯/毛雅妮. Non-supervisor executors only see their own orders plus pool.
          scope.orWhere('d.module_code IN (:...modules)', { modules });
        } else {
          scope.orWhere('d.handler_id IS NULL AND d.module_code IN (:...modules)', { modules });
        }
      }
    }));
  }

  private applyCommonFilters(qb: SelectQueryBuilder<DispatchedOrder>, query: ListDispatchedOrderQueryDto): void {
    const moduleCode = query.moduleCode ?? query.module_code ?? query.pool;
    if (moduleCode) qb.andWhere('d.module_code = :moduleCode', { moduleCode });
    const handlerId = query.handlerId ?? query.handler_id;
    if (handlerId) qb.andWhere('d.handler_id = :handlerId', { handlerId: handlerId === 'current' ? (query as ListDispatchedOrderQueryDto & { __currentUserId?: string }).__currentUserId : handlerId });
    if (query.status) qb.andWhere('d.status = :status', { status: query.status });
    if (!query.includeReturned) qb.andWhere('d.status <> :returned', { returned: DispatchedOrderStatus.RETURNED });
    if (query.onlyDirty) {
      qb.andWhere('EXISTS (SELECT 1 FROM work_order_field_dirty_marks dm WHERE dm.dispatched_order_id = d.id AND dm.is_active = true)');
    }
    if (query.keyword) {
      qb.andWhere('(w.employee_name ILIKE :keyword OR w.employee_id_card ILIKE :keyword OR w.order_no ILIKE :keyword)', {
        keyword: `%${query.keyword}%`,
      });
    }
  }

  private async loadDispatchedOrder(id: string): Promise<DispatchedOrder> {
    let order: DispatchedOrder | null;
    try {
      order = await this.dispatchedOrderRepository.findOne({
        where: { id },
        relations: { parentOrder: true, handler: true },
      });
    } catch (error) {
      this.rethrowInvalidIdAsNotFound(error, '子工单不存在');
    }
    if (!order) {
      throw new NotFoundException('子工单不存在');
    }
    return order;
  }

  private rethrowInvalidIdAsNotFound(error: unknown, message: string): never {
    const driverError = error instanceof QueryFailedError ? (error.driverError as { code?: string } | undefined) : undefined;
    if (driverError?.code === '22P02') {
      throw new NotFoundException(message);
    }
    throw error;
  }

  private async toDetailItem(order: DispatchedOrder, clearedDirtyCount = 0): Promise<DispatchedOrderDetailItem> {
    const fields = await this.fieldConfigRepository.find({ where: { isActive: true }, order: { displayOrder: 'ASC' } });
    const dirtyMarks = this.dirtyMarkRepository
      ? await this.dirtyMarkRepository.find({ where: { dispatchedOrderId: order.id } })
      : [];
    const dirtyByField = new Map<string, WorkOrderFieldDirtyMark>();
    for (const mark of dirtyMarks.filter((item) => item.isActive)) {
      dirtyByField.set(mark.fieldCode, mark);
    }
    const visibleSet = order.visibleFields ? new Set(order.visibleFields) : null;
    const filteredFields = fields.filter((field) => {
      const sameType = field.orderType === null || field.orderType === order.parentOrder.orderType;
      return sameType && (!visibleSet || visibleSet.has(field.fieldCode));
    });
    return {
      ...this.toListItem(order),
      handlerName: order.handler?.realName ?? null,
      handler_name: order.handler?.realName ?? null,
      parentOrder: {
        id: order.parentOrder.id,
        orderNo: order.parentOrder.orderNo,
        orderType: order.parentOrder.orderType,
        status: order.parentOrder.status,
        createdBy: order.parentOrder.createdBy,
        updatedAt: order.parentOrder.updatedAt,
      },
      extraData: order.parentOrder.extraData,
      extra_data: order.parentOrder.extraData,
      fields: filteredFields.map((field) => ({
        fieldCode: field.fieldCode,
        fieldName: field.fieldName,
        fieldType: field.fieldType,
        value: order.parentOrder.extraData[field.fieldCode] ?? null,
        permission: FieldPermissionMode.VISIBLE,
        dirty: dirtyByField.has(field.fieldCode),
        dirtyInfo: this.toDirtyInfo(dirtyByField.get(field.fieldCode)),
        dirty_info: this.toDirtyInfo(dirtyByField.get(field.fieldCode)),
        dropdownOptions: field.dropdownOptions?.map((option) => ({ label: option, value: option })),
        validation: {
          required: field.isRequired || field.defaultRequired,
          regex: field.validationRegex ?? undefined,
          regexMsg: field.validationMsg ?? undefined,
        },
      })),
      visibleFields: order.visibleFields,
      dirtyCount: dirtyMarks.filter((item) => item.isActive).length,
      dirty_count: dirtyMarks.filter((item) => item.isActive).length,
      clearedDirtyCount,
      cleared_dirty_count: clearedDirtyCount,
    };
  }

  private toDirtyInfo(mark?: WorkOrderFieldDirtyMark): Record<string, unknown> | null {
    if (!mark) return null;
    return {
      changedAt: mark.changedAt,
      changed_at: mark.changedAt,
      changedBy: mark.changedBy,
      changed_by: mark.changedBy,
      oldValue: mark.oldValue,
      old_value: mark.oldValue,
      newValue: mark.newValue,
      new_value: mark.newValue,
      clearReason: mark.clearReason,
      clear_reason: mark.clearReason,
    };
  }

  private async clearDirtyMarksForDispatchedOrder(order: DispatchedOrder, user: JwtUserPayload, clearReason: string): Promise<number> {
    if (!this.dirtyMarkRepository) return 0;
    if (!(this.isAdmin(user) || order.handlerId === user.sub || (await this.canActAsModuleSupervisor(user, order.moduleCode)))) {
      return 0;
    }
    const result = await this.dirtyMarkRepository
      .createQueryBuilder()
      .update(WorkOrderFieldDirtyMark)
      .set({ isActive: false, clearedAt: new Date(), clearedBy: user.sub, clearReason })
      .where('dispatched_order_id = :id', { id: order.id })
      .andWhere('is_active = true')
      .execute();
    const cleared = result.affected ?? 0;
    if (cleared > 0) {
      await this.writeLog('dispatched_order', order.id, user.sub, 'dirty_confirm_read', null, { cleared, clearReason });
    }
    return cleared;
  }

  private toListItem(order: DispatchedOrder): DispatchedOrderListItem {
    return {
      id: order.id,
      parentOrderId: order.parentOrderId,
      parent_order_id: order.parentOrderId,
      orderNo: order.parentOrder.orderNo,
      order_no: order.parentOrder.orderNo,
      moduleCode: order.moduleCode,
      module_code: order.moduleCode,
      status: order.status,
      handlerId: order.handlerId,
      handler_id: order.handlerId,
      employeeName: order.parentOrder.employeeName,
      employee_name: order.parentOrder.employeeName,
      customerId: order.parentOrder.customerId,
      customer_id: order.parentOrder.customerId,
      returnReason: order.returnReason,
      return_reason: order.returnReason,
      flowRound: order.flowRound ?? 0,
      flow_round: order.flowRound ?? 0,
      completionRemark: order.completionRemark ?? null,
      completion_remark: order.completionRemark ?? null,
      dispatchedAt: order.dispatchedAt,
      dispatched_at: order.dispatchedAt,
      acceptedAt: order.acceptedAt,
      accepted_at: order.acceptedAt,
      completedAt: order.completedAt,
      completed_at: order.completedAt,
      voidAt: order.voidAt ?? null,
      void_at: order.voidAt ?? null,
      createdAt: order.createdAt,
      created_at: order.createdAt,
      updatedAt: order.updatedAt,
      updated_at: order.updatedAt,
    };
  }

  private async assertCanRead(order: DispatchedOrder, user: JwtUserPayload): Promise<void> {
    if (this.isAdmin(user) || order.handlerId === user.sub) return;
    if (!order.handlerId && (await this.hasModuleAccess(user.sub, order.moduleCode))) return;
    if (await this.canViewAsSupervisor(user, order.moduleCode)) return;
    throw new ForbiddenException('无权访问该子工单');
  }

  private async assertCanHandle(order: DispatchedOrder, user: JwtUserPayload): Promise<void> {
    if (this.isAdmin(user) || order.handlerId === user.sub) return;
    if (await this.canActAsModuleSupervisor(user, order.moduleCode)) return;
    throw businessException(5000, HttpStatus.FORBIDDEN, '无权操作该子工单');
  }

  private assertNotVoidedForHandling(order: DispatchedOrder): void {
    if (order.voidAt || [WorkOrderStatus.VOID, WorkOrderStatus.VOID_PENDING, WorkOrderStatus.WITHDRAWN].includes(order.parentOrder.status)) {
      throw businessException(4204, HttpStatus.CONFLICT, '父工单已作废或不可办理，子工单不可继续办理');
    }
  }

  private async assertCanReturnCompleted(order: DispatchedOrder, user: JwtUserPayload): Promise<void> {
    if (this.isAdmin(user) || (await this.canActAsModuleSupervisor(user, order.moduleCode))) return;
    throw businessException(5001, HttpStatus.FORBIDDEN, '已完成子单仅模块主管或管理员可退回');
  }

  private async assertModulePoolAccess(user: JwtUserPayload, moduleCode: string): Promise<void> {
    if (this.isAdmin(user) || (await this.hasModuleAccess(user.sub, moduleCode))) return;
    throw businessException(5000, HttpStatus.FORBIDDEN, '无权接取该模块公共池工单');
  }

  private async assertCanViewTeam(user: JwtUserPayload, moduleCode: string): Promise<void> {
    if (this.isAdmin(user) || (await this.canViewAsSupervisor(user, moduleCode))) return;
    throw businessException(5000, HttpStatus.FORBIDDEN, '无权访问团队子工单');
  }

  private async canViewAsSupervisor(user: JwtUserPayload, moduleCode: string): Promise<boolean> {
    if (hasManagementScopeRole(user.roles)) return true;
    if (hasModuleSupervisorRole(user.roles) && (await this.hasModuleAccess(user.sub, moduleCode))) return true;
    return (await this.hasSupervisorLevel(user.sub)) && (await this.hasModuleAccess(user.sub, moduleCode));
  }

  private async canActAsModuleSupervisor(user: JwtUserPayload, moduleCode: string): Promise<boolean> {
    if (hasAnyRole(user.roles, ['business_owner', 'manager', 'biz_manager'])) return false;
    if (await this.hasModuleSupervisorConfig(user.sub, moduleCode)) return true;
    if (hasModuleSupervisorRole(user.roles) && (await this.hasModuleAccess(user.sub, moduleCode))) return true;
    return (await this.hasSupervisorLevel(user.sub)) && (await this.hasModuleAccess(user.sub, moduleCode));
  }

  private async hasModuleSupervisorConfig(userId: string, moduleCode: string): Promise<boolean> {
    if (!this.moduleSupervisorRepository) return false;
    const count = await this.moduleSupervisorRepository.count({ where: { supervisorId: userId, moduleCode, isActive: true } });
    return count > 0;
  }

  private async hasSupervisorLevel(userId: string): Promise<boolean> {
    const rows = await this.userRoleRepository.find({ where: { userId }, relations: { role: true } });
    return rows.some((row) => [RoleLevel.SUPERVISOR, RoleLevel.MANAGEMENT, RoleLevel.GLOBAL].includes(row.role.level));
  }

  private async hasModuleAccess(userId: string, moduleCode: string): Promise<boolean> {
    const count = await this.moduleHandlerRepository.count({ where: { handlerId: userId, moduleCode, isActive: true } });
    if (count > 0) return true;
    return this.hasModuleSupervisorConfig(userId, moduleCode);
  }

  private async getAccessibleModules(userId: string): Promise<string[]> {
    const handlerRows = await this.moduleHandlerRepository.find({ where: { handlerId: userId, isActive: true } });
    const handlerModules = handlerRows.map((row) => row.moduleCode);

    // Also include modules where the user is configured as a supervisor
    const supervisorModules: string[] = [];
    if (this.moduleSupervisorRepository) {
      const supervisorRows = await this.moduleSupervisorRepository.find({ where: { supervisorId: userId, isActive: true } });
      supervisorModules.push(...supervisorRows.map((row) => row.moduleCode));
    }

    return Array.from(new Set([...handlerModules, ...supervisorModules]));
  }

  private isAdmin(user: JwtUserPayload): boolean {
    return isAdminRole(user.roles);
  }

  private ensureAdminScope(roles: string[]): string[] {
    return roles.includes('admin') ? roles : [...roles, 'admin'];
  }

  private async checkMainOrderComplete(parentOrderId: string): Promise<void> {
    const children = await this.dispatchedOrderRepository.find({ where: { parentOrderId } });
    if (children.length === 0 || children.some((child) => child.status !== DispatchedOrderStatus.COMPLETED)) return;
    const workOrder = await this.workOrderRepository.findOne({ where: { id: parentOrderId } });
    if (!workOrder || workOrder.status === WorkOrderStatus.COMPLETED) return;
    const before = {
      id: workOrder.id,
      orderNo: workOrder.orderNo,
      status: workOrder.status,
      completedAt: workOrder.completedAt,
    };
    workOrder.status = WorkOrderStatus.COMPLETED;
    workOrder.completedAt = new Date();
    await this.workOrderRepository.save(workOrder);
    await this.writeLog('work_order', workOrder.id, null, 'close', before, {
      id: workOrder.id,
      orderNo: workOrder.orderNo,
      oldStatus: before.status,
      newStatus: workOrder.status,
      status: workOrder.status,
      completedAt: workOrder.completedAt,
      contextFields: {
        oldStatus: before.status,
        newStatus: workOrder.status,
        completedAt: workOrder.completedAt,
      },
    });
  }

    private async notifyCreator(order: DispatchedOrder, bizType: string, title: string, content: string): Promise<void> {
    await this.notificationRepository.save(this.notificationRepository.create({
      userId: order.parentOrder.createdBy,
      bizType,
      title,
      content,
      link: `/work-orders/${order.parentOrder.id}`,
      payload: { workOrderId: order.parentOrder.id, dispatchedOrderId: order.id, moduleCode: order.moduleCode },
      isRead: false,
      readAt: null,
    }));
  }

  private async writeLog(
    entityType: string,
    entityId: string,
    userId: string | null,
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

  private snapshot(order: DispatchedOrder): Record<string, unknown> {
    return {
      id: order.id,
      parentOrderId: order.parentOrderId,
      moduleCode: order.moduleCode,
      status: order.status,
      handlerId: order.handlerId,
      returnReason: order.returnReason,
      acceptedAt: order.acceptedAt,
      completedAt: order.completedAt,
    };
  }
}
