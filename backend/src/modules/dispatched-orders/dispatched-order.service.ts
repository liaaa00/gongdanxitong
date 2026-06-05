import { ForbiddenException, HttpStatus, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, MoreThan, QueryFailedError, Repository, SelectQueryBuilder } from 'typeorm';
import {
  BUSINESS_LEADER_ROLES,
  BUSINESS_MANAGER_ROLES,
  BUSINESS_MEMBER_ROLES,
  DATA_ENTRY_MODULE_ROLES,
  SOCIAL_INSURANCE_MODULE_ROLES,
  hasAnyRole,
  hasManagementScopeRole,
  hasModuleSupervisorRole,
  isAdminRole,
} from 'src/common/auth/role-permissions';
import {
  filterPhase1VisibleDispatchModules,
  isPhase1VisibleDispatchModule,
  isSocialInsuranceDispatchModule,
  resolveDispatchModuleCode,
} from 'src/common/constants/dispatch-modules';
import { businessException } from 'src/common/exceptions/business-exception';
import { isUuidLike } from 'src/common/utils/uuid-param';
import {
  DispatchedOrder,
  DispatchedOrderReturnRecord,
  DispatchedOrderStatus,
  FieldConfig,
  FieldPermissionMode,
  ModuleField,
  ModuleHandler,
  ModuleSupervisor,
  Notification,
  OperationLog,
  OrderStage,
  OrderType,
  RoleLevel,
  User,
  UserRole,
  WorkOrder,
  WorkOrderFieldDirtyMark,
  WorkOrderStatus,
} from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { ExportTemplatesService } from 'src/modules/admin/export-templates/export-templates.service';
import { FieldPermissionService } from 'src/modules/field-permissions/field-permission.service';
import { FieldSupplementService } from 'src/modules/field-supplement/field-supplement.service';
import { FieldChangeHook, FieldDiffItem } from 'src/modules/notifications/field-change.hook';
import { WorkOrderValidationService } from 'src/modules/work-orders/work-order-validation.service';
import { AcceptDispatchedOrderDto } from './dto/accept.dto';
import { BatchAcceptDispatchedOrderDto } from './dto/batch-accept.dto';
import { BatchCompleteDispatchedOrderDto } from './dto/batch-complete.dto';
import { BatchExportDispatchedOrderDto } from './dto/batch-export.dto';
import { BatchImportDispatchedOrderRowDto, BatchImportDispatchedOrdersDto } from './dto/batch-import.dto';
import { BatchReturnDispatchedOrderDto } from './dto/batch-return.dto';
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

const DISPATCHED_ORDER_STATUS_ALIASES: Record<string, DispatchedOrderStatus | DispatchedOrderStatus[]> = {
  accepted: DispatchedOrderStatus.PROCESSING,
  handling: DispatchedOrderStatus.PROCESSING,
  in_progress: DispatchedOrderStatus.PROCESSING,
  inprogress: DispatchedOrderStatus.PROCESSING,
  // 前端当前把 pending 和 processing 都展示为“处理中”；中文筛选需同时命中未接单待处理与已接单处理中。
  '处理中': [DispatchedOrderStatus.PENDING, DispatchedOrderStatus.PROCESSING],
  '處理中': [DispatchedOrderStatus.PENDING, DispatchedOrderStatus.PROCESSING],
};

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
    private readonly validationService: WorkOrderValidationService,
    @Optional()
    @InjectRepository(OrderStage)
    private readonly orderStageRepository?: Repository<OrderStage>,
    private readonly fieldChangeHook?: FieldChangeHook,
    @Optional()
    @InjectRepository(WorkOrderFieldDirtyMark)
    private readonly dirtyMarkRepository?: Repository<WorkOrderFieldDirtyMark>,
    @Optional()
    @InjectRepository(ModuleField)
    private readonly moduleFieldRepository?: Repository<ModuleField>,
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
    this.applyPhase1VisibleModuleScope(qb);

    await this.applyUserScope(qb, user, query.onlyPool === true || query.onlyUnclaimed === true, query.scope);
    this.applyCommonFilters(qb, { ...query, __currentUserId: user.sub } as ListDispatchedOrderQueryDto & { __currentUserId: string });

    const [rows, total] = await qb
      .orderBy('d.createdAt', 'DESC')
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .getManyAndCount();
    const configuredHandlerNamesByModule = await this.getConfiguredHandlerNamesByModule(rows.map((row) => row.moduleCode));
    return { items: rows.map((row) => this.toListItem(row, configuredHandlerNamesByModule.get(row.moduleCode) ?? [])), total, page, pageSize };
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
    return this.toDetailItem(order, 0);
  }

  async accept(
    id: string,
    _payload: AcceptDispatchedOrderDto,
    user: JwtUserPayload,
  ): Promise<DispatchedOrderDetailItem> {
    const order = await this.loadDispatchedOrder(id);
    this.assertParentAllowsDispatchedHandling(order);
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
    this.assertParentAllowsDispatchedHandling(order);
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
    this.assertParentAllowsDispatchedHandling(order);
    await this.assertCanHandle(order, user);
    const remark = payload.remark?.trim() ?? '';
    if (isSocialInsuranceDispatchModule(order.moduleCode) && remark.length === 0) {
      throw businessException(4223, HttpStatus.BAD_REQUEST, '社保公积金办理完成备注必填，请填写月份、基数、操作类型等追溯信息');
    }

    const completedAt = new Date();
    const result = await this.dispatchedOrderRepository
      .createQueryBuilder()
      .update(DispatchedOrder)
      .set({
        status: DispatchedOrderStatus.COMPLETED,
        completedAt,
        completionRemark: remark || null,
        handlerId: order.handlerId ?? user.sub,
        acceptedAt: order.acceptedAt ?? completedAt,
      })
      .where('id = :id', { id })
      .andWhere('status IN (:...statuses)', { statuses: [DispatchedOrderStatus.PENDING, DispatchedOrderStatus.PROCESSING] })
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
    await this.markTodoNotificationsReadForDispatchedOrder(order, user.sub);
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
    const blockedReason = this.describeTerminalBlockedStatus(order, '退回');
    if (blockedReason && order.status !== DispatchedOrderStatus.COMPLETED) {
      throw businessException(4201, HttpStatus.CONFLICT, blockedReason);
    }
    this.assertParentAllowsDispatchedHandling(order);
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

  async batchAccept(
    payload: BatchAcceptDispatchedOrderDto,
    user: JwtUserPayload,
  ): Promise<{ success: boolean; accepted: number; skipped: Array<{ id: string; reason: string }> }> {
    const skipped: Array<{ id: string; reason: string }> = [];
    let accepted = 0;
    const uniqueIds = Array.from(new Set(payload.ids));
    for (const id of uniqueIds) {
      try {
        await this.accept(id, {}, user);
        accepted += 1;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        skipped.push({ id, reason });
      }
    }

    return { success: true, accepted, skipped };
  }

  async batchReturn(
    payload: BatchReturnDispatchedOrderDto,
    user: JwtUserPayload,
  ): Promise<{ success: boolean; returned: number; skipped: Array<{ id: string; reason: string }> }> {
    const reason = payload.returnReason?.trim();
    if (!reason) {
      throw businessException(4222, HttpStatus.BAD_REQUEST, '批量退回原因必填');
    }

    const skipped: Array<{ id: string; reason: string }> = [];
    let returned = 0;
    const uniqueIds = Array.from(new Set(payload.ids));
    for (const id of uniqueIds) {
      try {
        await this.returnOrder(id, { returnReason: reason, returnedFields: payload.returnedFields ?? [] }, user);
        returned += 1;
      } catch (err) {
        const skipReason = err instanceof Error ? err.message : String(err);
        skipped.push({ id, reason: skipReason });
      }
    }

    return { success: true, returned, skipped };
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
      if (!isSocialInsuranceDispatchModule(order.moduleCode)) {
        skipped.push({ id, reason: '仅支持社保公积金增员/减员子单' });
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
      await this.markTodoNotificationsReadForDispatchedOrder(order, user.sub);
      await this.writeLog('dispatched_order', id, user.sub, 'social_insurance_batch_complete', this.snapshot(order), { remark });
      completed += 1;
    }

    return { success: true, completed, skipped };
  }

  async batchImport(
    payload: BatchImportDispatchedOrdersDto,
    user: JwtUserPayload,
  ): Promise<{
    success: boolean;
    totalRows: number;
    successRows: number;
    failRows: number;
    rows: Array<{ rowNumber: number; success: boolean; id?: string; orderNo?: string; employeeIdCard?: string; action?: string; message: string }>;
  }> {
    const moduleCode = resolveDispatchModuleCode(payload.moduleCode) ?? payload.moduleCode;
    const details: Array<{ rowNumber: number; success: boolean; id?: string; orderNo?: string; employeeIdCard?: string; action?: string; message: string }> = [];
    let successRows = 0;

    if (payload.mode === 'status' && !payload.forceAction) {
      throw businessException(4224, HttpStatus.BAD_REQUEST, '导入办理必须选择标准动作：批办理完成、批办理退回或保持处理中');
    }
    await this.assertCanBatchImportModule(moduleCode, user);

    for (let index = 0; index < payload.rows.length; index += 1) {
      const row = payload.rows[index];
      const rowNumber = index + 2;
      try {
        const order = await this.resolveImportTarget(moduleCode, row);
        if (payload.mode === 'status') {
          const action = payload.forceAction ?? this.normalizeImportResult(row.result ?? row.status ?? row.raw?.['办理结果'] ?? row.raw?.['状态']);
          if (!action) throw businessException(4224, HttpStatus.BAD_REQUEST, '导入办理必须选择标准动作：批办理完成、批办理退回或保持处理中');
          if (action === 'complete') {
            const remark = this.readImportString(row.remark ?? row.raw?.['办理备注'] ?? row.raw?.['备注'] ?? payload.defaultRemark) ?? '批量导入办理完成';
            await this.completeOrderByBatchImport(order, remark, user);
            details.push({ rowNumber, success: true, id: order.id, orderNo: order.parentOrder.orderNo, employeeIdCard: order.parentOrder.employeeIdCard, action: 'complete', message: '已更新为已完成' });
          } else if (action === 'return') {
            const returnReason = this.readImportString(row.returnReason ?? row.raw?.['退回原因'] ?? row.raw?.['原因'] ?? payload.defaultReturnReason);
            if (!returnReason) throw businessException(4222, HttpStatus.BAD_REQUEST, '退回结果必须填写退回原因');
            await this.returnOrder(order.id, { returnReason, returnedFields: [] }, user);
            details.push({ rowNumber, success: true, id: order.id, orderNo: order.parentOrder.orderNo, employeeIdCard: order.parentOrder.employeeIdCard, action: 'return', message: '已更新为已退回' });
          } else {
            await this.keepProcessingByBatchImport(order, row, user);
            details.push({ rowNumber, success: true, id: order.id, orderNo: order.parentOrder.orderNo, employeeIdCard: order.parentOrder.employeeIdCard, action: 'processing', message: '保持处理中' });
          }
        } else {
          const fields = this.extractAllowedImportFields(row);
          await this.applyImportedFields(order, fields, user);
          details.push({ rowNumber, success: true, id: order.id, orderNo: order.parentOrder.orderNo, employeeIdCard: order.parentOrder.employeeIdCard, action: 'fields', message: `已更新 ${Object.keys(fields).length} 个字段，状态未变更` });
        }
        successRows += 1;
      } catch (err) {
        details.push({
          rowNumber,
          success: false,
          orderNo: (this.readImportString(row.orderNo) ?? this.readImportAlias(row.raw, ['工单编号', '工单编码', '工单号', '编号', '主工单号', '主工单编号', '子工单号', '子工单编号', 'order_no', 'orderNo'])) ?? undefined,
          employeeIdCard: (this.readImportString(row.employeeIdCard ?? row.idCardNo) ?? this.readImportAlias(row.raw, ['员工证件号', '证件号', '证件号码', '身份证号', '身份证号码', '员工身份证号', '员工身份证号码', 'employee_id_card', 'employeeIdCard', 'id_card_no', 'idCardNo'])) ?? undefined,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { success: true, totalRows: payload.rows.length, successRows, failRows: payload.rows.length - successRows, rows: details };
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

  async creatorUpdateFields(
    id: string,
    payload: { fields?: Record<string, unknown>; reason?: string; workOrderUpdatedAt?: string },
    user: JwtUserPayload,
  ): Promise<DispatchedOrderDetailItem> {
    const order = await this.loadDispatchedOrder(id);
    this.assertCanCreatorOperate(order, user, '修改');
    this.assertCreatorActionAllowed(order, '修改');

    const fields = payload.fields && typeof payload.fields === 'object' ? payload.fields : {};
    const entries = Object.entries(fields).filter(([key]) => key.trim().length > 0);
    if (entries.length === 0) {
      throw businessException(4301, HttpStatus.BAD_REQUEST, '至少提供一个要修改的字段');
    }

    const visibleSet = order.visibleFields ? new Set(order.visibleFields) : null;
    const rejected = entries.filter(([fieldCode]) => visibleSet && !visibleSet.has(fieldCode)).map(([fieldCode]) => fieldCode);
    if (rejected.length > 0) {
      throw businessException(5001, HttpStatus.FORBIDDEN, `字段不属于当前子工单，不能在此修改：${rejected.join('、')}`);
    }

    if (
      payload.workOrderUpdatedAt
      && order.parentOrder.updatedAt.toISOString() !== new Date(payload.workOrderUpdatedAt).toISOString()
    ) {
      throw businessException(4201, HttpStatus.CONFLICT, '工单已被更新，请刷新后重试', {
        workOrderUpdatedAt: order.parentOrder.updatedAt.toISOString(),
      });
    }

    const beforeExtraData = { ...(order.parentOrder.extraData ?? {}) };
    const nextExtraData = { ...beforeExtraData };
    for (const [fieldCode, newValue] of entries) {
      nextExtraData[fieldCode] = newValue;
    }

    const diff = this.buildFieldDiff(beforeExtraData, nextExtraData);
    if (diff.length === 0) {
      return this.findOne(id, user);
    }

    const before = this.snapshot(order);
    const reason = payload.reason?.trim() || null;
    const previousStatus = order.status;

    if (this.isAcceptedDispatchedOrder(order)) {
      order.status = DispatchedOrderStatus.MODIFY_PENDING;
      order.returnReason = reason ? `业务员修改申请：${reason}` : '业务员修改申请';
      order.completedAt = null;
      await this.dispatchedOrderRepository.save(order);
      await this.notifyUsers(order, await this.resolveDispatchedRecipients(order), 'creator_modify_request', '业务员修改子工单待审批', reason || '业务员提交了字段修改申请，请审批');
      await this.writeLog('dispatched_order', id, user.sub, 'creator_modify_request', before, {
        fields: entries.map(([fieldCode]) => fieldCode),
        pendingFields: fields,
        pending_fields: fields,
        reason,
        diff,
        previousStatus,
        status: order.status,
      });
      return this.findOne(id, user);
    }

    order.parentOrder.extraData = nextExtraData;
    this.syncWorkOrderListFields(order.parentOrder);
    await this.workOrderRepository.save(order.parentOrder);
    await this.notifyUsers(order, await this.resolveDispatchedRecipients(order), 'creator_modified_before_accept', '业务员修改了未接单子工单', reason || '业务员在未接单前修改了字段，请关注');
    await this.writeLog('dispatched_order', id, user.sub, 'creator_update_fields', before, {
      fields: entries.map(([fieldCode]) => fieldCode),
      reason,
      diff,
      approvalSkipped: true,
      resubmitted: false,
      status: order.status,
    });
    await this.markAndNotifyAffectedDispatchedOrders(order, diff, user.sub, 'order.field_changed');

    return this.findOne(id, user);
  }

  async approveModify(id: string, payload: { approved?: boolean; comment?: string }, user: JwtUserPayload): Promise<DispatchedOrderDetailItem> {
    const order = await this.loadDispatchedOrder(id);
    if (order.status !== DispatchedOrderStatus.MODIFY_PENDING) {
      throw businessException(4201, HttpStatus.CONFLICT, '子工单未处于修改审批中');
    }
    await this.assertCanHandle(order, user);

    const requestLog = await this.readLatestDispatchedLog(order.id, 'creator_modify_request');
    const requestData = (requestLog?.afterData ?? {}) as Record<string, unknown>;
    const pendingFields = this.readRecord(requestData.pendingFields ?? requestData.pending_fields);
    if (!pendingFields || Object.keys(pendingFields).length === 0) {
      throw businessException(4201, HttpStatus.CONFLICT, '未找到待审批的修改内容，请让业务员重新提交修改申请');
    }

    const before = this.snapshot(order);
    const approved = payload.approved !== false;
    const previousStatus = await this.readPreviousDispatchedStatus(order.id, 'creator_modify_request', DispatchedOrderStatus.PROCESSING);
    const comment = payload.comment?.trim() || null;
    const requesterId = requestLog?.userId ?? order.parentOrder.createdBy;

    if (approved) {
      const beforeExtraData = { ...(order.parentOrder.extraData ?? {}) };
      const nextExtraData = { ...beforeExtraData, ...pendingFields };
      const diff = this.buildFieldDiff(beforeExtraData, nextExtraData);
      order.parentOrder.extraData = nextExtraData;
      this.syncWorkOrderListFields(order.parentOrder);
      await this.workOrderRepository.save(order.parentOrder);
      if (diff.length > 0) {
        await this.markAndNotifyAffectedDispatchedOrders(order, diff, requesterId, 'order.field_changed');
      }
    }

    order.status = approved ? previousStatus : previousStatus;
    order.returnReason = approved ? null : (comment ? `修改审批已拒绝：${comment}` : null);
    order.completedAt = null;
    await this.dispatchedOrderRepository.save(order);
    await this.notifyCreator(order, approved ? 'modify_approved' : 'modify_rejected', approved ? '子工单修改已通过' : '子工单修改已拒绝', comment || (approved ? '修改申请已通过' : '修改申请已拒绝'));
    await this.markTodoNotificationsReadForDispatchedOrder(order, user.sub);
    await this.writeLog('dispatched_order', id, user.sub, approved ? 'creator_modify_approved' : 'creator_modify_rejected', before, {
      approved,
      comment,
      previousStatus,
      status: order.status,
      appliedFields: approved ? pendingFields : null,
    });
    return this.findOne(id, user);
  }

  async urge(id: string, payload: { reason?: string }, user: JwtUserPayload): Promise<DispatchedOrderDetailItem> {
    const order = await this.loadDispatchedOrder(id);
    await this.urgeLoadedOrder(order, payload.reason, user);
    return this.findOne(id, user);
  }

  async batchUrge(
    payload: { ids?: string[]; reason?: string },
    user: JwtUserPayload,
  ): Promise<{ success: boolean; urged: number; skipped: Array<{ id: string; reason: string }> }> {
    const ids = Array.from(new Set(payload.ids ?? []));
    if (ids.length === 0) throw businessException(4224, HttpStatus.BAD_REQUEST, '请选择需要催办的子工单');
    const skipped: Array<{ id: string; reason: string }> = [];
    let urged = 0;
    for (const id of ids) {
      try {
        const order = await this.loadDispatchedOrder(id);
        await this.urgeLoadedOrder(order, payload.reason, user);
        urged += 1;
      } catch (err) {
        skipped.push({ id, reason: err instanceof Error ? err.message : String(err) });
      }
    }
    return { success: true, urged, skipped };
  }

  private async urgeLoadedOrder(order: DispatchedOrder, reasonInput: string | undefined, user: JwtUserPayload): Promise<void> {
    if (![DispatchedOrderStatus.PENDING, DispatchedOrderStatus.PROCESSING].includes(order.status)) {
      throw businessException(4201, HttpStatus.CONFLICT, '仅处理中子工单可催办');
    }

    const reason = reasonInput?.trim() || '请尽快处理该子工单';
    if (this.isAdmin(user) || order.parentOrder.createdBy === user.sub) {
      this.assertCreatorActionAllowed(order, '催办');
      await this.assertUrgeNotTooFrequent(order.id, user.sub, 'creator_urge');
      const recipients = await this.resolveDispatchedRecipients(order);
      await this.notifyUsers(order, recipients, 'creator_urge', '业务员催办子工单', reason);
      await this.writeLog('dispatched_order', order.id, user.sub, 'creator_urge', this.snapshot(order), { reason, recipients });
      return;
    }

    if (order.handlerId === user.sub || (await this.canActAsModuleSupervisor(user, order.moduleCode))) {
      await this.assertUrgeNotTooFrequent(order.id, user.sub, 'backend_urge_creator');
      await this.notifyCreator(order, 'backend_urge_creator', '后道催办', reason);
      await this.writeLog('dispatched_order', order.id, user.sub, 'backend_urge_creator', this.snapshot(order), { reason, recipient: order.parentOrder.createdBy });
      return;
    }

    throw businessException(5000, HttpStatus.FORBIDDEN, '无权催办该子工单');
  }

  async withdraw(id: string, payload: { reason?: string; moduleCode?: string; module_code?: string }, user: JwtUserPayload): Promise<DispatchedOrderDetailItem> {
    const order = await this.loadDispatchedOrderForCreatorAction(id, payload.moduleCode ?? payload.module_code);
    this.assertCanCreatorOperate(order, user, '撤回');
    this.assertCreatorActionAllowed(order, '撤回');
    const reason = payload.reason?.trim();
    if (!reason) {
      throw businessException(4222, HttpStatus.BAD_REQUEST, '撤回原因必填');
    }

    const before = this.snapshot(order);
    const previousStatus = order.status;
    if (!this.isAcceptedDispatchedOrder(order)) {
      order.status = DispatchedOrderStatus.WITHDRAWN;
      order.returnReason = `业务员未接单前直接撤回：${reason}`;
      order.completedAt = order.completedAt ?? new Date();
      await this.dispatchedOrderRepository.save(order);
      await this.notifyUsers(order, await this.resolveDispatchedRecipients(order), 'creator_withdraw_before_accept', '业务员撤回了未接单子工单', reason);
      await this.writeLog('dispatched_order', order.id, user.sub, 'creator_withdraw_direct_before_accept', before, {
        reason,
        previousStatus,
        status: order.status,
        approvalSkipped: true,
      });
      return this.findOne(order.id, user);
    }

    order.status = DispatchedOrderStatus.WITHDRAW_PENDING;
    order.returnReason = `业务员撤回申请：${reason}`;
    order.completedAt = null;
    await this.dispatchedOrderRepository.save(order);
    await this.notifyUsers(order, await this.resolveDispatchedRecipients(order), 'creator_withdraw_request', '业务员撤回子工单待审批', reason);
    await this.writeLog('dispatched_order', order.id, user.sub, 'creator_withdraw_request', before, { reason, previousStatus, status: order.status });
    return this.findOne(order.id, user);
  }

  async approveWithdraw(id: string, payload: { approved?: boolean; comment?: string }, user: JwtUserPayload): Promise<DispatchedOrderDetailItem> {
    const order = await this.loadDispatchedOrder(id);
    if (order.status !== DispatchedOrderStatus.WITHDRAW_PENDING) {
      throw businessException(4201, HttpStatus.CONFLICT, '子工单未处于撤回审批中');
    }
    await this.assertCanHandle(order, user);
    const before = this.snapshot(order);
    const approved = payload.approved !== false;
    const previousStatus = await this.readPreviousDispatchedStatus(order.id, 'creator_withdraw_request', DispatchedOrderStatus.PROCESSING);
    const comment = payload.comment?.trim() || null;

    order.status = approved ? DispatchedOrderStatus.WITHDRAWN : previousStatus;
    order.returnReason = approved
      ? (comment ? `撤回已通过：${comment}` : (order.returnReason || '业务员撤回已通过，可直接作废'))
      : comment ? `撤回已拒绝：${comment}` : null;
    order.completedAt = approved ? (order.completedAt ?? new Date()) : null;
    if (approved) {
      order.parentOrder.status = WorkOrderStatus.WITHDRAWN;
      order.parentOrder.completedAt = order.parentOrder.completedAt ?? new Date();
      await this.workOrderRepository.save(order.parentOrder);
    }
    await this.dispatchedOrderRepository.save(order);
    await this.notifyCreator(order, approved ? 'withdraw_approved' : 'withdraw_rejected', approved ? '子工单撤回已通过，可直接作废' : '子工单撤回已拒绝', comment || (approved ? '撤回申请已通过' : '撤回申请已拒绝'));
    if (approved) {
      await this.markTodoNotificationsReadForDispatchedOrder(order, user.sub);
    }
    await this.writeLog('dispatched_order', id, user.sub, approved ? 'creator_withdraw_approved' : 'creator_withdraw_rejected', before, { approved, comment, previousStatus, status: order.status });
    return this.findOne(id, user);
  }

  async voidByCreator(id: string, payload: { reason?: string; moduleCode?: string; module_code?: string }, user: JwtUserPayload): Promise<DispatchedOrderDetailItem> {
    const order = await this.loadDispatchedOrderForCreatorAction(id, payload.moduleCode ?? payload.module_code);
    this.assertCanCreatorOperate(order, user, '作废');
    this.assertCreatorActionAllowed(order, '作废');
    const reason = payload.reason?.trim();
    if (!reason) {
      throw businessException(4222, HttpStatus.BAD_REQUEST, '作废原因必填');
    }

    const before = this.snapshot(order);
    const previousStatus = order.status;

    if (!this.isAcceptedDispatchedOrder(order)) {
      order.status = DispatchedOrderStatus.VOID;
      order.voidAt = new Date();
      order.returnReason = `业务员未接单前直接作废：${reason}`;
      order.completedAt = order.completedAt ?? new Date();
      await this.dispatchedOrderRepository.save(order);
      await this.notifyUsers(order, await this.resolveDispatchedRecipients(order), 'creator_void_before_accept', '业务员作废了未接单子工单', reason);
      await this.writeLog('dispatched_order', order.id, user.sub, 'creator_void_direct_before_accept', before, {
        reason,
        previousStatus,
        status: order.status,
        voidAt: order.voidAt,
        approvalSkipped: true,
      });
      return this.findOne(order.id, user);
    }

    // 0602 E-5/目标-6：撤回成功后发起人作废，子单直接进入 VOID 终态，无需后道二次审批。
    // 其余状态（处理中/待处理/已退回）仍走 VOID_PENDING 审批流，避免越权直接作废在办子单。
    if (order.status === DispatchedOrderStatus.WITHDRAWN) {
      order.status = DispatchedOrderStatus.VOID;
      order.voidAt = new Date();
      order.returnReason = `业务员撤回后直接作废：${reason}`;
      order.completedAt = order.completedAt ?? new Date();
      await this.dispatchedOrderRepository.save(order);
      await this.notifyCreator(order, 'void_approved', '子工单已作废', reason);
      await this.markTodoNotificationsReadForDispatchedOrder(order, user.sub);
      await this.writeLog('dispatched_order', order.id, user.sub, 'creator_void_direct', before, {
        reason,
        previousStatus,
        status: order.status,
        voidAt: order.voidAt,
        approvalSkipped: true,
      });
      return this.findOne(order.id, user);
    }

    order.status = DispatchedOrderStatus.VOID_PENDING;
    order.returnReason = `业务员作废申请：${reason}`;
    order.completedAt = null;
    await this.dispatchedOrderRepository.save(order);
    await this.notifyUsers(order, await this.resolveDispatchedRecipients(order), 'creator_void_request', '业务员作废子工单待审批', reason);
    await this.writeLog('dispatched_order', order.id, user.sub, 'creator_void_request', before, { reason, previousStatus, status: order.status });
    return this.findOne(order.id, user);
  }

  async approveVoid(id: string, payload: { approved?: boolean; comment?: string }, user: JwtUserPayload): Promise<DispatchedOrderDetailItem> {
    const order = await this.loadDispatchedOrder(id);
    if (order.status !== DispatchedOrderStatus.VOID_PENDING) {
      throw businessException(4201, HttpStatus.CONFLICT, '子工单未处于作废审批中');
    }
    await this.assertCanHandle(order, user);
    const before = this.snapshot(order);
    const approved = payload.approved !== false;
    const previousStatus = await this.readPreviousDispatchedStatus(order.id, 'creator_void_request', DispatchedOrderStatus.PROCESSING);
    const comment = payload.comment?.trim() || null;

    order.status = approved ? DispatchedOrderStatus.VOID : previousStatus;
    order.voidAt = approved ? new Date() : null;
    order.returnReason = approved ? (order.returnReason || '业务员作废') : comment ? `作废已拒绝：${comment}` : null;
    order.completedAt = approved ? (order.completedAt ?? new Date()) : null;
    await this.dispatchedOrderRepository.save(order);
    await this.notifyCreator(order, approved ? 'void_approved' : 'void_rejected', approved ? '子工单作废已通过' : '子工单作废已拒绝', comment || (approved ? '作废申请已通过' : '作废申请已拒绝'));
    if (approved) {
      await this.markTodoNotificationsReadForDispatchedOrder(order, user.sub);
    }
    await this.writeLog('dispatched_order', id, user.sub, approved ? 'creator_void_approved' : 'creator_void_rejected', before, { approved, comment, previousStatus, status: order.status, voidAt: order.voidAt });
    return this.findOne(id, user);
  }

  async restoreVoidByCreator(id: string, payload: { moduleCode?: string; module_code?: string }, user: JwtUserPayload): Promise<DispatchedOrderDetailItem> {
    const order = await this.loadDispatchedOrderForCreatorAction(id, payload.moduleCode ?? payload.module_code);
    this.assertCanCreatorRestoreVoid(order, user);
    if (order.status !== DispatchedOrderStatus.VOID || !order.voidAt) {
      throw businessException(4201, HttpStatus.CONFLICT, '仅已作废的子工单可撤销作废');
    }
    if ([WorkOrderStatus.VOID_PENDING, WorkOrderStatus.WITHDRAW_PENDING].includes(order.parentOrder.status)) {
      throw businessException(4204, HttpStatus.CONFLICT, '父工单审批中，暂不可撤销作废');
    }

    const before = this.snapshot(order);
    order.status = DispatchedOrderStatus.PENDING;
    order.voidAt = null;
    order.completedAt = null;
    order.returnReason = null;
    if ([WorkOrderStatus.VOID, WorkOrderStatus.WITHDRAWN, WorkOrderStatus.COMPLETED].includes(order.parentOrder.status)) {
      order.parentOrder.status = WorkOrderStatus.PROCESSING;
      order.parentOrder.completedAt = null;
      await this.workOrderRepository.save(order.parentOrder);
    }
    await this.dispatchedOrderRepository.save(order);
    await this.writeLog('dispatched_order', id, user.sub, 'creator_restore_void', before, { status: order.status, voidAt: order.voidAt, parentStatus: order.parentOrder.status });
    // 0528 feedback: restoring a void child order must not create a new notification.
    return this.findOne(id, user);
  }

  /**
   * 0602 E-1/E-2/E-3：子工单级“重新提交”。发起人可在【已退回 / 已撤回 / 已作废】子单详情页重提，
   * 合并了原“撤销作废”语义（撤销作废 = 已作废子单的一次重提）。
   * 行为：子单重新流转到原模块对应后道（保留原 handler；为空则按模块默认主办重新指派），
   * 状态回到待处理(pending)，父工单若处于终态则回到处理中(processing)，并通知后道。
   * 入参可携带修改后的 extraData（与 E-4 配合：修改仅存内容，重提才真正流转）。
   * 兜底：非发起人调用被拒；状态不允许时返回明确冲突错误码。
   */
  async resubmitDispatched(
    id: string,
    payload: { extraData?: Record<string, unknown>; reason?: string; moduleCode?: string; module_code?: string; workOrderUpdatedAt?: string },
    user: JwtUserPayload,
  ): Promise<DispatchedOrderDetailItem> {
    const order = await this.loadDispatchedOrderForCreatorAction(id, payload.moduleCode ?? payload.module_code);
    this.assertCanCreatorOperate(order, user, '重新提交');

    const RESUBMITTABLE = [
      DispatchedOrderStatus.RETURNED,
      DispatchedOrderStatus.WITHDRAWN,
      DispatchedOrderStatus.VOID,
    ];
    if (!RESUBMITTABLE.includes(order.status)) {
      throw businessException(4201, HttpStatus.CONFLICT, '仅已退回、已撤回或已作废的子工单可重新提交');
    }
    if ([WorkOrderStatus.VOID_PENDING, WorkOrderStatus.WITHDRAW_PENDING].includes(order.parentOrder.status)) {
      throw businessException(4204, HttpStatus.CONFLICT, '父工单审批中，暂不可重新提交');
    }

    // 乐观锁：与 creatorUpdateFields 一致，避免并发覆盖。
    if (
      payload.workOrderUpdatedAt
      && order.parentOrder.updatedAt.toISOString() !== new Date(payload.workOrderUpdatedAt).toISOString()
    ) {
      throw businessException(4201, HttpStatus.CONFLICT, '工单已被更新，请刷新后重试', {
        workOrderUpdatedAt: order.parentOrder.updatedAt.toISOString(),
      });
    }

    const before = this.snapshot(order);
    const previousStatus = order.status;

    // 可选：携带修改后的字段（仅限当前子单可见字段），合并保存到父工单 extraData。
    let parentTouched = false;
    const fields = payload.extraData && typeof payload.extraData === 'object' ? payload.extraData : {};
    const entries = Object.entries(fields).filter(([key]) => key.trim().length > 0);
    if (entries.length > 0) {
      const visibleSet = order.visibleFields ? new Set(order.visibleFields) : null;
      const rejected = entries.filter(([fieldCode]) => visibleSet && !visibleSet.has(fieldCode)).map(([fieldCode]) => fieldCode);
      if (rejected.length > 0) {
        throw businessException(5001, HttpStatus.FORBIDDEN, `字段不属于当前子工单，不能在此修改：${rejected.join('、')}`);
      }
      const nextExtraData = { ...(order.parentOrder.extraData ?? {}) };
      for (const [fieldCode, newValue] of entries) {
        nextExtraData[fieldCode] = newValue;
      }
      order.parentOrder.extraData = nextExtraData;
      this.syncWorkOrderListFields(order.parentOrder);
      parentTouched = true;
    }

    // 重新指派：保留原 handler；为空（曾进过待认领池/被作废清空）则按模块默认主办重新指派。
    if (!order.handlerId) {
      order.handlerId = await this.resolveDefaultModuleHandler(order.moduleCode);
    }

    order.status = DispatchedOrderStatus.PENDING;
    order.voidAt = null;
    order.completedAt = null;
    order.acceptedAt = null;
    order.returnReason = null;
    order.dispatchedAt = new Date();

    // 父工单若处于终态/撤回/作废，重提后回到处理中，使整单可继续流转。
    if ([WorkOrderStatus.VOID, WorkOrderStatus.WITHDRAWN, WorkOrderStatus.COMPLETED, WorkOrderStatus.RETURNED].includes(order.parentOrder.status)) {
      order.parentOrder.status = WorkOrderStatus.PROCESSING;
      order.parentOrder.completedAt = null;
      parentTouched = true;
    }
    if (parentTouched) {
      await this.workOrderRepository.save(order.parentOrder);
    }
    await this.dispatchedOrderRepository.save(order);

    await this.writeLog('dispatched_order', order.id, user.sub, 'creator_resubmit', before, {
      previousStatus,
      status: order.status,
      handlerId: order.handlerId,
      fields: entries.map(([fieldCode]) => fieldCode),
      reason: payload.reason?.trim() || null,
      parentStatus: order.parentOrder.status,
    });

    // 通知后道：重提子单已重新流转，请继续办理。
    const recipients = await this.resolveDispatchedRecipients(order);
    await this.notifyUsers(order, recipients, 'dispatch_resubmit', '子工单已重新提交', payload.reason?.trim() || '业务员已重新提交该子工单，请继续办理');

    return this.findOne(order.id, user);
  }

  /** 按模块默认主办（isBackup:false，权重高者优先）解析处理人；无主办时返回 null（进入待认领池）。 */
  private async resolveDefaultModuleHandler(moduleCode: string): Promise<string | null> {
    const handlers = await this.moduleHandlerRepository.find({
      where: { moduleCode, isActive: true, isBackup: false },
      order: { weight: 'DESC', handlerId: 'ASC' },
    });
    return handlers[0]?.handlerId ?? null;
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
    if ([DispatchedOrderStatus.COMPLETED, DispatchedOrderStatus.MODIFY_PENDING, DispatchedOrderStatus.WITHDRAW_PENDING, DispatchedOrderStatus.WITHDRAWN, DispatchedOrderStatus.VOID_PENDING, DispatchedOrderStatus.VOID].includes(order.status) || order.voidAt) {
      throw businessException(4201, HttpStatus.CONFLICT, '已完成、审批中或已终止的子工单不允许转交');
    }
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

  async batchExport(payload: BatchExportDispatchedOrderDto, user: JwtUserPayload): Promise<DispatchedOrderExportResult> {
    const ids = Array.from(new Set(payload.ids));
    for (const id of ids) {
      const order = await this.loadDispatchedOrder(id);
      await this.assertCanRead(order, user);
    }
    return this.exportTemplatesService.exportDispatchedOrdersAuto(ids, payload.templateId ?? payload.template_id, user);
  }

  async remove(id: string, user: JwtUserPayload): Promise<{ success: boolean; id: string }> {
    void id;
    void user;
    throw businessException(4208, HttpStatus.FORBIDDEN, '子工单不允许单独删除，请在主工单列表删除主工单，系统会联动清理下级子工单');
  }

  async batchRemove(
    ids: string[],
    user: JwtUserPayload,
  ): Promise<{ success: boolean; deleted: number; skipped: Array<{ id: string; reason: string }> }> {
    void ids;
    void user;
    throw businessException(4208, HttpStatus.FORBIDDEN, '子工单不允许批量删除，请在主工单列表删除主工单，系统会联动清理下级子工单');
  }

  private async resolveImportTarget(moduleCode: string, row: BatchImportDispatchedOrderRowDto): Promise<DispatchedOrder> {
    const orderNo = this.readImportString(row.orderNo) ?? this.readImportAlias(row.raw, ['工单编号', '工单编码', '工单号', '编号', '主工单号', '主工单编号', '子工单号', '子工单编号', 'order_no', 'orderNo']);
    const employeeIdCard = this.readImportString(row.employeeIdCard ?? row.idCardNo) ?? this.readImportAlias(row.raw, ['员工证件号', '证件号', '证件号码', '身份证号', '身份证号码', '员工身份证号', '员工身份证号码', 'employee_id_card', 'employeeIdCard', 'id_card_no', 'idCardNo']);
    if (!orderNo && !employeeIdCard) {
      throw businessException(4224, HttpStatus.BAD_REQUEST, '必须提供工单号或员工证件号用于匹配子工单');
    }

    const qb = this.dispatchedOrderRepository
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.parentOrder', 'w')
      .leftJoinAndSelect('d.handler', 'h')
      .where('d.module_code = :moduleCode', { moduleCode });
    if (orderNo) qb.andWhere('w.order_no = :orderNo', { orderNo });
    if (employeeIdCard) qb.andWhere('w.employee_id_card = :employeeIdCard', { employeeIdCard });
    const matches = await qb.orderBy('d.created_at', 'DESC').getMany();
    if (matches.length === 0) {
      const identity = [orderNo ? `工单号：${orderNo}` : '', employeeIdCard ? `身份证号：${employeeIdCard}` : ''].filter(Boolean).join('，');
      throw businessException(4040, HttpStatus.NOT_FOUND, `未匹配到${moduleCode}子工单（${identity || '缺少匹配条件'}），请检查导入表后重新导入`);
    }
    if (matches.length === 1) return matches[0];

    const openStatuses = new Set([DispatchedOrderStatus.PENDING, DispatchedOrderStatus.PROCESSING, DispatchedOrderStatus.RETURNED]);
    const openMatches = matches.filter((item) => openStatuses.has(item.status) && !item.voidAt);
    if (openMatches.length === 1) return openMatches[0];
    throw businessException(4224, HttpStatus.CONFLICT, '匹配到多条子工单，请在导入表中补充工单号');
  }

  private readImportAlias(raw: Record<string, unknown> | undefined, aliases: string[]): string | null {
    if (!raw) return null;
    const normalized = new Map<string, unknown>();
    for (const [key, value] of Object.entries(raw)) {
      const textKey = String(key || '').trim();
      normalized.set(textKey, value);
      normalized.set(this.normalizeImportHeader(textKey), value);
    }
    for (const alias of aliases) {
      const value = normalized.get(alias) ?? normalized.get(this.normalizeImportHeader(alias));
      const text = this.readImportString(value);
      if (text) return text;
    }
    return null;
  }

  private normalizeImportHeader(value: string): string {
    return String(value || '')
      .replace(/^\ufeff/, '')
      .replace(/[\s\u00a0\u3000]+/g, '')
      .replace(/[：:（）()\[\]【】]/g, '')
      .toLowerCase();
  }

  private normalizeImportResult(value: unknown): 'complete' | 'return' | 'processing' | null {
    const raw = this.readImportString(value)?.toLowerCase();
    if (!raw) return null;
    if (['完成', '已完成', '办结', '已办结', '成功', '办理成功', 'complete', 'completed', 'done', 'success'].includes(raw)) return 'complete';
    if (['退回', '已退回', '返回', '驳回', '业务问题', '业务数据问题', '资料问题', '数据问题', 'return', 'returned', 'reject', 'rejected'].includes(raw)) return 'return';
    if (['处理中', '办理中', '等待', '待复办', '复办等待', '需要复办', '暂缓', 'pending', 'processing', 'wait', 'waiting', 'retry'].includes(raw)) return 'processing';
    return null;
  }

  private describeTerminalBlockedStatus(order: DispatchedOrder, actionLabel: string): string | null {
    if (order.voidAt || order.status === DispatchedOrderStatus.VOID) {
      return `该子工单已作废，不能${actionLabel}`;
    }
    if (order.status === DispatchedOrderStatus.COMPLETED) {
      return `该子工单已完成，不能${actionLabel}`;
    }
    if ([DispatchedOrderStatus.MODIFY_PENDING, DispatchedOrderStatus.WITHDRAW_PENDING, DispatchedOrderStatus.VOID_PENDING].includes(order.status)) {
      return `该子工单正在审批中，不能${actionLabel}`;
    }
    if (order.status === DispatchedOrderStatus.WITHDRAWN) {
      return `该子工单已撤回，不能${actionLabel}`;
    }
    return null;
  }

  private extractAllowedImportFields(row: BatchImportDispatchedOrderRowDto): Record<string, unknown> {
    const source: Record<string, unknown> = { ...(row.raw ?? {}), ...(row.fields ?? {}) };
    const aliasMap: Record<string, string[]> = {
      bank_name: ['bank_name', '开户银行信息', '开户银行', '银行名称', '开户行', '开户行名称'],
      bank_account: ['bank_account', '银行借记卡帐号', '银行借记卡账号', '银行账号', '银行卡号', '银行卡账号', '工资卡号'],
    };
    const fields: Record<string, unknown> = {};
    for (const [fieldCode, aliases] of Object.entries(aliasMap)) {
      for (const alias of aliases) {
        const value = source[alias];
        if (value !== undefined && value !== null && String(value).trim().length > 0) {
          fields[fieldCode] = value;
          break;
        }
      }
    }
    if (Object.keys(fields).length === 0) {
      throw businessException(4301, HttpStatus.BAD_REQUEST, '未读取到允许批量修改的银行卡字段');
    }
    return fields;
  }

  private async applyImportedFields(order: DispatchedOrder, fields: Record<string, unknown>, user: JwtUserPayload): Promise<void> {
    if (order.moduleCode !== 'onboarding_contact') {
      throw businessException(4224, HttpStatus.BAD_REQUEST, '批量导入修改目前仅支持入职联系子工单');
    }
    const blockedReason = this.describeTerminalBlockedStatus(order, '批量导入修改字段');
    if (blockedReason) {
      throw businessException(4201, HttpStatus.CONFLICT, blockedReason);
    }
    await this.assertCanHandle(order, user);
    const allowed = new Set(['bank_name', 'bank_account']);
    const entries = Object.entries(fields).filter(([fieldCode]) => allowed.has(fieldCode));
    if (entries.length === 0) {
      throw businessException(4301, HttpStatus.BAD_REQUEST, '未读取到允许批量修改的银行卡字段');
    }

    const beforeExtraData = { ...(order.parentOrder.extraData ?? {}) };
    const nextExtraData = { ...beforeExtraData };
    for (const [fieldCode, value] of entries) nextExtraData[fieldCode] = value;
    const diff = this.fieldChangeHook?.buildDiff(beforeExtraData, nextExtraData) ?? entries.map(([fieldCode]) => ({ field: fieldCode, before: beforeExtraData[fieldCode] ?? null, after: nextExtraData[fieldCode] ?? null }));
    if (diff.length === 0) return;

    order.parentOrder.extraData = nextExtraData;
    order.parentOrder.lastModifiedAt = new Date();
    order.parentOrder.lastModifiedBy = user.sub;
    order.parentOrder.modificationRound += 1;
    await this.workOrderRepository.save(order.parentOrder);
    await this.writeLog('dispatched_order', order.id, user.sub, 'batch_import_field_update', this.snapshot(order), { fields: entries.map(([fieldCode]) => fieldCode), diff });
    await this.markAndNotifyAffectedDispatchedOrders(order, diff, user.sub, 'order.field_changed');
  }

  private async keepProcessingByBatchImport(order: DispatchedOrder, row: BatchImportDispatchedOrderRowDto, user: JwtUserPayload): Promise<void> {
    const blockedReason = this.describeTerminalBlockedStatus(order, '批量导入保持处理中');
    if (blockedReason) {
      throw businessException(4201, HttpStatus.CONFLICT, blockedReason);
    }
    this.assertParentAllowsDispatchedHandling(order);
    await this.assertCanHandle(order, user);
    if (![DispatchedOrderStatus.PENDING, DispatchedOrderStatus.PROCESSING].includes(order.status)) {
      throw businessException(4201, HttpStatus.CONFLICT, '当前状态不允许导入保持处理中');
    }
    const before = this.snapshot(order);
    if (order.status === DispatchedOrderStatus.PENDING) {
      order.status = DispatchedOrderStatus.PROCESSING;
      order.acceptedAt = order.acceptedAt ?? new Date();
      order.handlerId = order.handlerId ?? user.sub;
      await this.dispatchedOrderRepository.save(order);
    }
    await this.writeLog('dispatched_order', order.id, user.sub, 'batch_import_keep_processing', before, {
      remark: this.readImportString(row.remark ?? row.raw?.['办理备注'] ?? row.raw?.['备注']) ?? null,
      status: order.status,
    });
  }

  private async completeOrderByBatchImport(order: DispatchedOrder, remark: string, user: JwtUserPayload): Promise<void> {
    const blockedReason = this.describeTerminalBlockedStatus(order, '批量导入办理完成');
    if (blockedReason) {
      throw businessException(4201, HttpStatus.CONFLICT, blockedReason);
    }
    this.assertParentAllowsDispatchedHandling(order);
    await this.assertCanHandle(order, user);
    if (![DispatchedOrderStatus.PENDING, DispatchedOrderStatus.PROCESSING].includes(order.status)) {
      throw businessException(4201, HttpStatus.CONFLICT, '当前状态不允许导入办理完成');
    }
    const before = this.snapshot(order);
    order.status = DispatchedOrderStatus.COMPLETED;
    order.completedAt = new Date();
    order.acceptedAt = order.acceptedAt ?? new Date();
    order.handlerId = order.handlerId ?? user.sub;
    order.completionRemark = remark;
    await this.dispatchedOrderRepository.save(order);
    await this.checkMainOrderComplete(order.parentOrderId);
    await this.markTodoNotificationsReadForDispatchedOrder(order, user.sub);
    await this.writeLog('dispatched_order', order.id, user.sub, 'batch_import_complete', before, { remark });
  }

  private async markTodoNotificationsReadForDispatchedOrder(order: DispatchedOrder, userId: string): Promise<void> {
    const readAt = new Date();
    const todoBizTypes = [
      'dispatch',
      'dispatch_created',
      'dispatch_resubmit',
      'dispatched_new',
      'dispatch_reassign',
      'reassigned_to_you',
      'pool_new',
      'creator_modify_request',
      'creator_withdraw_request',
      'creator_void_request',
      'creator_urge',
    ];
    const rows = await this.notificationRepository.find({
      where: {
        userId,
        isRead: false,
        bizType: In(todoBizTypes),
      },
    });
    const matched = rows.filter((row) => this.notificationMatchesDispatchedOrder(row, order));
    if (matched.length === 0) return;

    for (const row of matched) {
      row.isRead = true;
      row.readAt = readAt;
    }
    await this.notificationRepository.save(matched);
  }

  private notificationMatchesDispatchedOrder(notification: Notification, order: DispatchedOrder): boolean {
    const payload = (notification.payload ?? {}) as Record<string, unknown>;
    const dispatchedOrderId = this.readImportString(payload.dispatchedOrderId ?? payload.dispatched_order_id ?? payload.entityId ?? payload.entity_id);
    if (dispatchedOrderId && dispatchedOrderId === order.id) return true;

    const workOrderId = this.readImportString(payload.workOrderId ?? payload.work_order_id ?? payload.parentOrderId ?? payload.parent_order_id);
    const moduleCode = this.readImportString(payload.moduleCode ?? payload.module_code);
    if (workOrderId === order.parentOrderId && (!moduleCode || moduleCode === order.moduleCode)) return true;

    const link = notification.link ?? '';
    return link.includes(order.id) || (link.includes(order.parentOrderId) && (!moduleCode || moduleCode === order.moduleCode));
  }

  private readImportString(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
  }

  private syncWorkOrderListFields(workOrder: WorkOrder): void {
    const extraData = workOrder.extraData ?? {};
    const customerName = this.readImportString(extraData.customer_name);
    const customerCode = this.readImportString(extraData.customer_code);
    const employeeName = this.readImportString(extraData.employee_name);
    const employeeIdCard = this.readImportString(extraData.id_card_no ?? extraData.employee_id_card);
    if (customerName !== null) workOrder.customerName = customerName;
    if (customerCode !== null) workOrder.customerCode = customerCode;
    if (employeeName !== null) workOrder.employeeName = employeeName;
    if (employeeIdCard !== null) workOrder.employeeIdCard = employeeIdCard;
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
      .leftJoinAndSelect('w.creator', 'creator')
      .leftJoinAndSelect('d.handler', 'h');
  }

  private applyPhase1VisibleModuleScope(qb: SelectQueryBuilder<DispatchedOrder>): void {
    qb.andWhere('d.module_code IN (:...phase1Modules)', { phase1Modules: filterPhase1VisibleDispatchModules([
      'onboarding_contact',
      'contract',
      'data_entry',
      'social_insurance',
      'resignation_contact',
      'data_entry_resign',
      'resignation_social_insurance',
    ]) });
    qb.andWhere("w.order_type::text IN ('onboarding','resignation')");
  }

  private async applyUserScope(
    qb: SelectQueryBuilder<DispatchedOrder>,
    user: JwtUserPayload,
    onlyPool: boolean,
    requestedScope?: string,
  ): Promise<void> {
    if (this.isAdmin(user)) {
      if (onlyPool) qb.andWhere('d.handler_id IS NULL');
      return;
    }
    const modules = await this.getAccessibleModules(user.sub, user.roles);
    const canSeeModuleAll = hasManagementScopeRole(user.roles) || hasModuleSupervisorRole(user.roles) || (await this.hasSupervisorLevel(user.sub));
    const includeCreatorScope = this.shouldIncludeCreatorScope(user, modules);
    const restrictAssignedScope = this.shouldRestrictAssignedScope(user, modules);
    const isBusinessManagementUser = hasAnyRole(user.roles, BUSINESS_MANAGER_ROLES) || hasAnyRole(user.roles, BUSINESS_LEADER_ROLES);
    const isBusinessMemberUser = hasAnyRole(user.roles, BUSINESS_MEMBER_ROLES);
    const isBusinessSideUser = isBusinessManagementUser || isBusinessMemberUser;
    const useTeamBusinessScope = requestedScope === 'team' && isBusinessManagementUser;
    const businessScopeDepartmentIds = !onlyPool && useTeamBusinessScope
      ? await this.validationService.resolveUserDepartmentIds(user.sub)
      : [];
    qb.andWhere(new Brackets((scope) => {
      if (!onlyPool) {
        if (businessScopeDepartmentIds.length > 0) {
          scope.where('w.department_id IN (:...businessScopeDepartmentIds)', { businessScopeDepartmentIds });
        } else if (isBusinessSideUser) {
          scope.where('w.created_by = :userId', { userId: user.sub });
        } else if (restrictAssignedScope && modules.length > 0) {
          scope.where('d.handler_id = :userId AND d.module_code IN (:...modules)', { userId: user.sub, modules });
        } else if (restrictAssignedScope) {
          scope.where('1 = 0');
        } else {
          scope.where('d.handler_id = :userId', { userId: user.sub });
        }
        if (includeCreatorScope && !isBusinessMemberUser) {
          scope.orWhere('w.created_by = :userId', { userId: user.sub });
        }
      } else {
        scope.where('1 = 0');
      }
      if (!isBusinessSideUser && modules.length > 0) {
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

  private shouldIncludeCreatorScope(user: JwtUserPayload, accessibleModules: readonly string[]): boolean {
    if (hasAnyRole(user.roles, BUSINESS_MEMBER_ROLES) || hasAnyRole(user.roles, BUSINESS_MANAGER_ROLES) || hasAnyRole(user.roles, BUSINESS_LEADER_ROLES)) {
      return true;
    }
    // Backend processors must only see their assigned/responsible child modules in phase 1.
    // If a backend user happens to be the parent work order creator, do not let that creator scope leak unrelated modules.
    return accessibleModules.length === 0;
  }

  private shouldRestrictAssignedScope(user: JwtUserPayload, accessibleModules: readonly string[]): boolean {
    if (hasAnyRole(user.roles, BUSINESS_MEMBER_ROLES) || hasAnyRole(user.roles, BUSINESS_MANAGER_ROLES) || hasAnyRole(user.roles, BUSINESS_LEADER_ROLES)) {
      return false;
    }
    return accessibleModules.length > 0;
  }

  private applyCommonFilters(qb: SelectQueryBuilder<DispatchedOrder>, query: ListDispatchedOrderQueryDto): void {
    const moduleCodes = this.normalizeModuleCodeList(query.moduleCode ?? query.module_code ?? query.moduleName ?? query.nodeType ?? query.pool);
    this.applySingleOrMultiFilter(qb, 'd.module_code', 'moduleCode', moduleCodes);

    const handlerIds = this.normalizeQueryList(query.handlerId ?? query.handler_id ?? query.assignee ?? query.assigneeId ?? query.assignee_id)
      .map((handlerId) => handlerId === 'current' ? (query as ListDispatchedOrderQueryDto & { __currentUserId?: string }).__currentUserId : handlerId)
      .filter((handlerId): handlerId is string => Boolean(handlerId));
    this.applySingleOrMultiFilter(qb, 'd.handler_id', 'handlerId', handlerIds);

    const statuses = this.normalizeStatusList(query.status ?? query.statuses ?? query.statusIn);
    this.applySingleOrMultiFilter(qb, 'd.status', statuses.length === 1 ? 'status' : 'statuses', statuses);

    const orderTypes = this.normalizeQueryList(query.orderType ?? query.order_type ?? query.type);
    this.applySingleOrMultiFilter(qb, 'w.order_type', orderTypes.length === 1 ? 'orderType' : 'orderTypes', orderTypes);

    const departmentIds = this.normalizeQueryList(query.departmentId ?? query.department_id ?? query.department);
    this.applySingleOrMultiFilter(qb, 'w.department_id', departmentIds.length === 1 ? 'departmentId' : 'departmentIds', departmentIds);

    const orderNo = query.orderNo ?? query.order_no;
    if (orderNo) qb.andWhere('w.order_no ILIKE :orderNo', { orderNo: `%${orderNo}%` });
    const customerCode = query.customerCode ?? query.customer_code;
    if (customerCode) qb.andWhere('w.customer_code ILIKE :customerCode', { customerCode: `%${customerCode}%` });
    const customerName = query.customerName ?? query.customer_name;
    if (customerName) qb.andWhere("(w.customer_name ILIKE :customerName OR w.extra_data->>'customer_name' ILIKE :customerName OR w.extra_data->>'customerName' ILIKE :customerName)", { customerName: `%${customerName}%` });
    const employeeName = query.employeeName ?? query.employee_name;
    if (employeeName) qb.andWhere("(w.employee_name ILIKE :employeeName OR w.extra_data->>'employee_name' ILIKE :employeeName OR w.extra_data->>'employeeName' ILIKE :employeeName)", { employeeName: `%${employeeName}%` });
    const createdByName = query.createdByName ?? query.created_by_name ?? query.created_by ?? query.creatorName;
    if (createdByName) qb.andWhere("(creator.real_name ILIKE :createdByName OR creator.username ILIKE :createdByName OR w.created_by::text ILIKE :createdByName)", { createdByName: `%${createdByName}%` });
    const handlerName = query.handlerName ?? query.handler_name;
    if (handlerName) qb.andWhere("(h.real_name ILIKE :handlerName OR h.username ILIKE :handlerName OR d.handler_id::text ILIKE :handlerName)", { handlerName: `%${handlerName}%` });
    const idCardNo = query.idCardNo ?? query.employeeIdCard ?? query.employee_id_card;
    if (idCardNo) qb.andWhere("(w.employee_id_card ILIKE :idCardNo OR w.extra_data->>'id_card_no' ILIKE :idCardNo OR w.extra_data->>'employee_id_card' ILIKE :idCardNo OR w.extra_data->>'employeeIdCard' ILIKE :idCardNo OR w.extra_data->>'idCardNo' ILIKE :idCardNo)", { idCardNo: `%${idCardNo}%` });
    const orderMonth = query.orderMonth ?? query.order_month;
    if (orderMonth) qb.andWhere("to_char(COALESCE(d.dispatched_at, d.created_at), 'YYYY-MM') = :orderMonth", { orderMonth });
    if (query.dispatchedFrom) qb.andWhere('d.dispatched_at >= :dispatchedFrom', { dispatchedFrom: query.dispatchedFrom });
    if (query.dispatchedTo) qb.andWhere('d.dispatched_at <= :dispatchedTo', { dispatchedTo: query.dispatchedTo });
    if (query.completedFrom) qb.andWhere('d.completed_at >= :completedFrom', { completedFrom: query.completedFrom });
    if (query.completedTo) qb.andWhere('d.completed_at <= :completedTo', { completedTo: query.completedTo });
    if (query.onlyDirty) {
      qb.andWhere('EXISTS (SELECT 1 FROM work_order_field_dirty_marks dm WHERE dm.dispatched_order_id = d.id AND dm.is_active = true)');
    }
    if (query.keyword) {
      qb.andWhere('(w.employee_name ILIKE :keyword OR w.employee_id_card ILIKE :keyword OR w.order_no ILIKE :keyword)', {
        keyword: `%${query.keyword}%`,
      });
    }
  }

  private normalizeQueryList(value?: string | string[] | null): string[] {
    const items = Array.isArray(value) ? value : [value];
    return Array.from(new Set(items
      .flatMap((item) => String(item ?? '').split(','))
      .map((item) => item.trim())
      .filter(Boolean)));
  }

  private normalizeModuleCodeList(value?: string | string[] | null): string[] {
    return this.normalizeQueryList(value)
      .map((item) => resolveDispatchModuleCode(item))
      .filter((item): item is string => Boolean(item));
  }

  private normalizeStatusList(value?: string | string[] | null): DispatchedOrderStatus[] {
    const allowed = new Set<string>(Object.values(DispatchedOrderStatus));
    const statuses = this.normalizeQueryList(value)
      .map((status) => status.toLowerCase())
      .flatMap((status) => {
        const alias = DISPATCHED_ORDER_STATUS_ALIASES[status];
        return Array.isArray(alias) ? alias : [alias ?? status];
      })
      .filter((status) => allowed.has(status));
    return Array.from(new Set(statuses)) as DispatchedOrderStatus[];
  }

  private applySingleOrMultiFilter(qb: SelectQueryBuilder<DispatchedOrder>, column: string, paramName: string, values: string[]): void {
    if (values.length === 0) return;
    if (values.length === 1) {
      qb.andWhere(`${column} = :${paramName}`, { [paramName]: values[0] });
      return;
    }
    qb.andWhere(`${column} IN (:...${paramName})`, { [paramName]: values });
  }

  private async loadDispatchedOrderForCreatorAction(id: string, moduleCode?: string | null): Promise<DispatchedOrder> {
    if (isUuidLike(id)) {
      return this.loadDispatchedOrder(id);
    }

    const token = String(id || '').trim();
    const normalizedModuleCode = String(moduleCode || '').trim();
    if (!token) {
      throw new NotFoundException('子工单不存在');
    }

    const qb = this.dispatchedOrderRepository.createQueryBuilder('d')
      .leftJoinAndSelect('d.parentOrder', 'w')
      .leftJoinAndSelect('w.creator', 'creator')
      .leftJoinAndSelect('d.handler', 'handler')
      .where('w.order_no = :token', { token });

    if (normalizedModuleCode) {
      qb.andWhere('d.module_code = :moduleCode', { moduleCode: normalizedModuleCode });
    }

    const matches = await qb.orderBy('d.created_at', 'DESC').getMany();
    if (matches.length === 1) {
      return matches[0];
    }

    throw new NotFoundException('子工单不存在');
  }

  private async loadDispatchedOrder(id: string): Promise<DispatchedOrder> {
    let order: DispatchedOrder | null;
    try {
      order = await this.dispatchedOrderRepository.findOne({
        where: { id },
        relations: { parentOrder: { creator: true }, handler: true },
      });
    } catch (error) {
      this.rethrowInvalidIdAsNotFound(error, '子工单不存在');
    }
    if (!order) {
      throw new NotFoundException('子工单不存在');
    }
    if (!isPhase1VisibleDispatchModule(order.moduleCode) || !['onboarding', 'resignation'].includes(String(order.parentOrder.orderType))) {
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
    const pendingModify = order.status === DispatchedOrderStatus.MODIFY_PENDING
      ? await this.readPendingModify(order.id)
      : null;
    const dirtyMarks = this.dirtyMarkRepository
      ? await this.dirtyMarkRepository.find({ where: { dispatchedOrderId: order.id } })
      : [];
    const dirtyByField = new Map<string, WorkOrderFieldDirtyMark>();
    for (const mark of dirtyMarks.filter((item) => item.isActive)) {
      dirtyByField.set(mark.fieldCode, mark);
    }
    const visibleSet = order.visibleFields ? new Set(order.visibleFields) : null;
    const configuredHandlerNames = (await this.getConfiguredHandlerNamesByModule([order.moduleCode])).get(order.moduleCode) ?? [];
    const filteredFields = fields.filter((field) => {
      const sameType = field.orderType === null || field.orderType === order.parentOrder.orderType;
      return sameType && (!visibleSet || visibleSet.has(field.fieldCode));
    });
    return {
      ...this.toListItem(order, configuredHandlerNames),
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
      pendingModify,
      pending_modify: pendingModify,
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

  private async getConfiguredHandlerNamesByModule(moduleCodes: string[]): Promise<Map<string, string[]>> {
    const codes = Array.from(new Set(moduleCodes.filter(Boolean)));
    const result = new Map<string, string[]>();
    if (codes.length === 0) return result;
    const handlers = await this.moduleHandlerRepository.find({
      where: { moduleCode: In(codes), isActive: true },
      relations: { handler: true },
      order: { isBackup: 'ASC', weight: 'DESC' },
    });
    for (const item of handlers) {
      const name = item.handler?.realName || item.handler?.username || item.handlerId;
      if (!name) continue;
      const list = result.get(item.moduleCode) ?? [];
      if (!list.includes(name)) list.push(name);
      result.set(item.moduleCode, list);
    }
    return result;
  }

  private toListItem(order: DispatchedOrder, configuredHandlerNames: string[] = []): DispatchedOrderListItem {
    const extraData = order.parentOrder.extraData ?? {};
    const employeeName = this.readImportString(extraData.employee_name) ?? order.parentOrder.employeeName;
    const employeeIdCard = this.readImportString(extraData.id_card_no ?? extraData.employee_id_card) ?? order.parentOrder.employeeIdCard;
    const customerCode = this.readImportString(extraData.customer_code) ?? order.parentOrder.customerCode;
    const customerName = this.readImportString(extraData.customer_name) ?? order.parentOrder.customerName;
    const creatorName = order.parentOrder.creator?.realName || order.parentOrder.creator?.username || order.parentOrder.createdBy;
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
      creatorId: order.parentOrder.createdBy,
      creator_id: order.parentOrder.createdBy,
      createdBy: order.parentOrder.createdBy,
      created_by: order.parentOrder.createdBy,
      creatorName,
      creator_name: creatorName,
      createdByName: creatorName,
      created_by_name: creatorName,
      employeeName,
      employee_name: employeeName,
      employeeIdCard,
      employee_id_card: employeeIdCard,
      customerId: order.parentOrder.customerId,
      customer_id: order.parentOrder.customerId,
      customerCode,
      customer_code: customerCode,
      customerName,
      customer_name: customerName,
      orderType: order.parentOrder.orderType,
      order_type: order.parentOrder.orderType,
      returnReason: order.returnReason,
      return_reason: order.returnReason,
      flowRound: order.flowRound ?? 0,
      flow_round: order.flowRound ?? 0,
      completionRemark: order.completionRemark ?? null,
      completion_remark: order.completionRemark ?? null,
      dispatchedAt: order.dispatchedAt,
      dispatched_at: order.dispatchedAt,
      dueAt: order.dueAt ?? null,
      due_at: order.dueAt ?? null,
      slaHours: order.slaHours ?? null,
      sla_hours: order.slaHours ?? null,
      slaReminderBeforeHours: order.slaReminderBeforeHours ?? null,
      sla_reminder_before_hours: order.slaReminderBeforeHours ?? null,
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
      configuredHandlerNames,
      configured_handler_names: configuredHandlerNames,
    };
  }

  private async assertCanRead(order: DispatchedOrder, user: JwtUserPayload): Promise<void> {
    if (this.isAdmin(user) || order.parentOrder.createdBy === user.sub) return;
    if (order.handlerId === user.sub && this.canReadAssignedModule(user, order.moduleCode)) return;
    if (!order.handlerId && (await this.hasModuleAccess(user.sub, order.moduleCode, user.roles))) return;
    if (await this.canViewAsSupervisor(user, order.moduleCode)) return;
    throw new ForbiddenException('无权访问该子工单');
  }

  private canReadAssignedModule(user: JwtUserPayload, moduleCode: string): boolean {
    if (hasAnyRole(user.roles, BUSINESS_MEMBER_ROLES) || hasAnyRole(user.roles, BUSINESS_MANAGER_ROLES) || hasAnyRole(user.roles, BUSINESS_LEADER_ROLES)) {
      return true;
    }
    return this.filterModulesByRoleAllowList(user.roles, [moduleCode]).includes(moduleCode);
  }

  private async assertCanHandle(order: DispatchedOrder, user: JwtUserPayload): Promise<void> {
    if (this.isAdmin(user)) return;
    if (order.handlerId === user.sub && this.canReadAssignedModule(user, order.moduleCode)) return;
    if (await this.canActAsModuleSupervisor(user, order.moduleCode)) return;
    throw businessException(5000, HttpStatus.FORBIDDEN, '无权操作该子工单');
  }

  private async assertCanBatchImportModule(moduleCode: string, user: JwtUserPayload): Promise<void> {
    if (this.isAdmin(user)) return;
    if (await this.hasModuleAccess(user.sub, moduleCode, user.roles)) return;
    const roleCodes = user.roles ?? [];
    if (hasAnyRole(roleCodes, BUSINESS_MEMBER_ROLES) || roleCodes.some((role) => ['business_owner', 'business_group_leader', 'business_manager'].includes(role))) {
      throw businessException(5000, HttpStatus.FORBIDDEN, '业务侧账号不可导入办理子工单');
    }
    throw businessException(5000, HttpStatus.FORBIDDEN, '无权导入办理该子工单类型');
  }

  private assertParentAllowsDispatchedHandling(order: DispatchedOrder): void {
    if (order.voidAt || [WorkOrderStatus.VOID, WorkOrderStatus.VOID_PENDING, WorkOrderStatus.WITHDRAW_PENDING, WorkOrderStatus.WITHDRAWN].includes(order.parentOrder.status)) {
      throw businessException(4204, HttpStatus.CONFLICT, '父工单已作废、已撤回、撤回中或不可办理，子工单不可继续办理');
    }
  }

  private assertCanCreatorOperate(order: DispatchedOrder, user: JwtUserPayload, actionLabel: string): void {
    if (this.isAdmin(user) || order.parentOrder.createdBy === user.sub) return;
    throw businessException(5000, HttpStatus.FORBIDDEN, `仅工单发起人可${actionLabel}该子工单`);
  }

  private assertCanCreatorRestoreVoid(order: DispatchedOrder, user: JwtUserPayload): void {
    if (order.parentOrder.createdBy !== user.sub || !hasAnyRole(user.roles, BUSINESS_MEMBER_ROLES)) {
      throw businessException(5000, HttpStatus.FORBIDDEN, '仅创建该工单的业务员可撤销作废该子工单');
    }
  }

  private isAcceptedDispatchedOrder(order: DispatchedOrder): boolean {
    return Boolean(order.acceptedAt) || order.status === DispatchedOrderStatus.PROCESSING;
  }

  private assertCreatorActionAllowed(order: DispatchedOrder, actionLabel: string): void {
    if (!([DispatchedOrderStatus.RETURNED, DispatchedOrderStatus.WITHDRAWN].includes(order.status) && ['作废', '修改'].includes(actionLabel))) {
      this.assertParentAllowsDispatchedHandling(order);
    }
    if (order.voidAt || order.status === DispatchedOrderStatus.VOID) {
      throw businessException(4201, HttpStatus.CONFLICT, `已作废的子工单不允许${actionLabel}`);
    }
    if (order.status === DispatchedOrderStatus.COMPLETED) {
      throw businessException(4201, HttpStatus.CONFLICT, `已完成的子工单不允许${actionLabel}`);
    }
    if (order.status === DispatchedOrderStatus.WITHDRAWN && !['作废', '修改'].includes(actionLabel)) {
      throw businessException(4201, HttpStatus.CONFLICT, `已撤回的子工单不允许${actionLabel}`);
    }
    if ([DispatchedOrderStatus.MODIFY_PENDING, DispatchedOrderStatus.WITHDRAW_PENDING, DispatchedOrderStatus.VOID_PENDING].includes(order.status)) {
      throw businessException(4201, HttpStatus.CONFLICT, `审批中的子工单不允许${actionLabel}`);
    }
  }

  private async assertCanReturnCompleted(order: DispatchedOrder, user: JwtUserPayload): Promise<void> {
    if (this.isAdmin(user) || (await this.canActAsModuleSupervisor(user, order.moduleCode))) return;
    throw businessException(5001, HttpStatus.FORBIDDEN, '已完成子单仅模块主管或管理员可退回');
  }

  private async assertModulePoolAccess(user: JwtUserPayload, moduleCode: string): Promise<void> {
    if (this.isAdmin(user) || (await this.hasModuleAccess(user.sub, moduleCode, user.roles))) return;
    throw businessException(5000, HttpStatus.FORBIDDEN, '无权接取该模块待认领工单');
  }

  private async assertCanViewTeam(user: JwtUserPayload, moduleCode: string): Promise<void> {
    if (this.isAdmin(user) || (await this.canViewAsSupervisor(user, moduleCode))) return;
    throw businessException(5000, HttpStatus.FORBIDDEN, '无权访问团队子工单');
  }

  private async canViewAsSupervisor(user: JwtUserPayload, moduleCode: string): Promise<boolean> {
    if (hasManagementScopeRole(user.roles)) return true;
    if (this.roleAllowsModule(user.roles, moduleCode)) return true;
    if (user.roles.length > 0 && !this.filterModulesByRoleAllowList(user.roles, [moduleCode]).includes(moduleCode)) return false;
    if (hasModuleSupervisorRole(user.roles) && (await this.hasModuleAccess(user.sub, moduleCode, user.roles))) return true;
    return (await this.hasSupervisorLevel(user.sub)) && (await this.hasModuleAccess(user.sub, moduleCode, user.roles));
  }

  private async canActAsModuleSupervisor(user: JwtUserPayload, moduleCode: string): Promise<boolean> {
    if (hasAnyRole(user.roles, ['business_owner', 'manager', 'biz_manager'])) return false;
    if (this.roleAllowsModule(user.roles, moduleCode)) return true;
    if (user.roles.length > 0 && !this.filterModulesByRoleAllowList(user.roles, [moduleCode]).includes(moduleCode)) return false;
    if (await this.hasModuleSupervisorConfig(user.sub, moduleCode)) return true;
    if (hasModuleSupervisorRole(user.roles) && (await this.hasModuleAccess(user.sub, moduleCode, user.roles))) return true;
    return (await this.hasSupervisorLevel(user.sub)) && (await this.hasModuleAccess(user.sub, moduleCode, user.roles));
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

  private async hasModuleAccess(userId: string, moduleCode: string, roles: readonly string[] = []): Promise<boolean> {
    if (this.roleAllowsModule(roles, moduleCode)) return true;
    if (roles.length > 0 && !this.filterModulesByRoleAllowList(roles, [moduleCode]).includes(moduleCode)) return false;
    const count = await this.moduleHandlerRepository.count({ where: { handlerId: userId, moduleCode, isActive: true } });
    if (count > 0) return true;
    return this.hasModuleSupervisorConfig(userId, moduleCode);
  }

  private async getAccessibleModules(userId: string, roles: readonly string[] = []): Promise<string[]> {
    const handlerRows = await this.moduleHandlerRepository.find({ where: { handlerId: userId, isActive: true } });
    const handlerModules = handlerRows.map((row) => row.moduleCode);

    // Also include modules where the user is configured as a supervisor.
    // 0603 backend fallback: role-level allow lists are authoritative for phase-1 backend accounts.
    // This prevents stale/legacy handler or supervisor rows from leaking unrelated modules, e.g. 江璐 must not see social_insurance.
    const supervisorModules: string[] = [];
    if (this.moduleSupervisorRepository) {
      const supervisorRows = await this.moduleSupervisorRepository.find({ where: { supervisorId: userId, isActive: true } });
      supervisorModules.push(...supervisorRows.map((row) => row.moduleCode));
    }

    return this.filterModulesByRoleAllowList(roles, filterPhase1VisibleDispatchModules([...handlerModules, ...supervisorModules, ...this.roleAccessibleModules(roles)]));
  }

  private roleAllowsModule(roles: readonly string[], moduleCode: string): boolean {
    if (this.sharedTeamModuleCodes().includes(moduleCode)) return this.hasSharedTeamRole(roles);
    if (this.contractModuleCodes().includes(moduleCode)) return hasAnyRole(roles, ['contract_specialist', 'labor_contract_member', 'contract_team']);
    if (this.onboardingContactModuleCodes().includes(moduleCode)) return hasAnyRole(roles, ['onboarding_specialist', 'onboarding_resignation_member', 'onboarding_team']);
    if (moduleCode === 'data_entry' || moduleCode === 'data_entry_resign') return hasAnyRole(roles, DATA_ENTRY_MODULE_ROLES);
    if (isSocialInsuranceDispatchModule(moduleCode)) return hasAnyRole(roles, SOCIAL_INSURANCE_MODULE_ROLES);
    return false;
  }

  private roleAccessibleModules(roles: readonly string[]): string[] {
    const modules: string[] = [];
    if (this.hasSharedTeamRole(roles)) modules.push(...this.sharedTeamModuleCodes());
    else {
      if (hasAnyRole(roles, ['contract_specialist', 'labor_contract_member', 'contract_team'])) modules.push(...this.contractModuleCodes());
      if (hasAnyRole(roles, ['onboarding_specialist', 'onboarding_resignation_member', 'onboarding_team'])) modules.push(...this.onboardingContactModuleCodes());
    }
    if (hasAnyRole(roles, DATA_ENTRY_MODULE_ROLES)) modules.push('data_entry', 'data_entry_resign');
    if (hasAnyRole(roles, SOCIAL_INSURANCE_MODULE_ROLES)) modules.push('social_insurance', 'resignation_social_insurance');
    return filterPhase1VisibleDispatchModules(modules);
  }

  private filterModulesByRoleAllowList(roles: readonly string[], moduleCodes: string[]): string[] {
    if (roles.includes('admin') || hasAnyRole(roles, BUSINESS_MANAGER_ROLES) || hasAnyRole(roles, BUSINESS_LEADER_ROLES)) {
      return filterPhase1VisibleDispatchModules(moduleCodes);
    }
    const allowed = new Set(this.roleAccessibleModules(roles));
    if (allowed.size === 0) return filterPhase1VisibleDispatchModules(moduleCodes);
    return filterPhase1VisibleDispatchModules(moduleCodes).filter((moduleCode) => allowed.has(moduleCode));
  }

  private hasSharedTeamRole(roles: readonly string[]): boolean {
    return hasAnyRole(roles, ['shared_leader', 'shared_team_owner']);
  }

  private sharedTeamModuleCodes(): string[] {
    return ['contract', 'onboarding_contact', 'resignation_contact'];
  }

  private contractModuleCodes(): string[] {
    return ['contract'];
  }

  private onboardingContactModuleCodes(): string[] {
    return ['onboarding_contact', 'resignation_contact'];
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
    if (!workOrder || workOrder.status === WorkOrderStatus.COMPLETED || [WorkOrderStatus.WITHDRAWN, WorkOrderStatus.VOID].includes(workOrder.status)) return;
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

    if (workOrder.orderType === OrderType.RESIGNATION) {
      await this.notificationRepository.save(this.notificationRepository.create({
        userId: workOrder.createdBy,
        bizType: 'resignation_completed',
        title: '离职工单已办结',
        content: `离职工单 ${workOrder.orderNo} 已全部办结，请查看归档结果。`,
        link: `/work-orders/${workOrder.id}`,
        payload: {
          workOrderId: workOrder.id,
          orderNo: workOrder.orderNo,
          entityType: 'work_order',
          entityId: workOrder.id,
          orderType: workOrder.orderType,
          completedAt: workOrder.completedAt,
        },
        isRead: false,
        readAt: null,
      }));
    }
  }

  private async resolveUserDisplayName(userId: string): Promise<string> {
    if (!userId) return '系统';
    try {
      const user = await this.workOrderRepository.manager.getRepository(User).findOne({ where: { id: userId } });
      return user?.realName || user?.username || userId;
    } catch {
      return userId;
    }
  }

  private async markAndNotifyAffectedDispatchedOrders(
    sourceOrder: DispatchedOrder,
    diff: Array<{ field: string; before: unknown; after: unknown }>,
    actorUserId: string,
    bizType: string,
  ): Promise<void> {
    if (diff.length === 0) return;
    const changedFields = Array.from(new Set(diff.map((item) => item.field).filter(Boolean)));
    if (changedFields.length === 0) return;

    const children = await this.dispatchedOrderRepository.find({ where: { parentOrderId: sourceOrder.parentOrderId } });
    const activeChildren = children.filter((child) => !child.voidAt && ![DispatchedOrderStatus.WITHDRAWN, DispatchedOrderStatus.VOID].includes(child.status));
    if (activeChildren.length === 0) return;

    const fieldConfigs = await this.fieldConfigRepository.find({ where: { fieldCode: In(changedFields) } });
    const fieldNameMap = new Map(fieldConfigs.map((field) => [field.fieldCode, field.fieldName]));
    const moduleFieldRows = this.moduleFieldRepository
      ? await this.moduleFieldRepository.find({ where: { fieldCode: In(changedFields), isActive: true } })
      : [];
    const modulesByField = new Map<string, Set<string>>();
    for (const row of moduleFieldRows) {
      if (!modulesByField.has(row.fieldCode)) modulesByField.set(row.fieldCode, new Set<string>());
      modulesByField.get(row.fieldCode)?.add(row.moduleCode);
    }

    const diffByField = new Map(diff.map((item) => [item.field, item]));
    const now = new Date();
    const dirtyRows: WorkOrderFieldDirtyMark[] = [];
    const notifications: Notification[] = [];
    const actorName = await this.resolveUserDisplayName(actorUserId);

    for (const child of activeChildren) {
      const affectedFields = changedFields.filter((fieldCode) => this.childContainsField(child, fieldCode, modulesByField));
      if (affectedFields.length === 0) continue;

      if (this.dirtyMarkRepository) {
        for (const fieldCode of affectedFields) {
          const item = diffByField.get(fieldCode);
          dirtyRows.push(this.dirtyMarkRepository.create({
            workOrderId: sourceOrder.parentOrderId,
            dispatchedOrderId: child.id,
            moduleCode: child.moduleCode,
            fieldCode,
            fieldLabel: fieldNameMap.get(fieldCode) ?? fieldCode,
            oldValue: item?.before ?? null,
            newValue: item?.after ?? null,
            changedBy: actorUserId,
            changedAt: now,
            flowRound: child.flowRound ?? sourceOrder.parentOrder.modificationRound ?? 0,
            isActive: true,
            clearedAt: null,
            clearedBy: null,
            clearReason: null,
          }));
        }
      }

      const recipients = (await this.resolveDispatchedRecipients(child)).filter((userId) => userId !== actorUserId);
      for (const userId of recipients) {
        notifications.push(this.notificationRepository.create({
          userId,
          bizType,
          title: '子工单字段已同步修改',
          content: `${actorName} 修改了工单 ${sourceOrder.parentOrder.orderNo} 的 ${affectedFields.map((field) => fieldNameMap.get(field) ?? field).join('、')}，请核对`,
          link: `/my-dispatched/${child.id}`,
          payload: {
            workOrderId: sourceOrder.parentOrderId,
            orderNo: sourceOrder.parentOrder.orderNo,
            dispatchedOrderId: child.id,
            sourceDispatchedOrderId: sourceOrder.id,
            entityType: 'dispatched_order',
            entityId: child.id,
            moduleCode: child.moduleCode,
            fields: affectedFields,
            diff: affectedFields.map((field) => diffByField.get(field)).filter(Boolean),
            priority: 'normal',
          },
          isRead: false,
          readAt: null,
        }));
      }
    }

    if (dirtyRows.length > 0 && this.dirtyMarkRepository) {
      await this.dirtyMarkRepository.save(dirtyRows);
    }
    if (notifications.length > 0) {
      await this.notificationRepository.save(notifications);
    }
    if (dirtyRows.length > 0 || notifications.length > 0) {
      await this.writeLog('work_order', sourceOrder.parentOrderId, actorUserId, 'dispatched_field_sync_marked', null, {
        fields: changedFields,
        dirtyCount: dirtyRows.length,
        notificationCount: notifications.length,
        sourceDispatchedOrderId: sourceOrder.id,
      });
    }
  }

  private childContainsField(child: DispatchedOrder, fieldCode: string, modulesByField: Map<string, Set<string>>): boolean {
    const mappedModules = modulesByField.get(fieldCode);
    if (mappedModules && mappedModules.size > 0) return mappedModules.has(child.moduleCode);
    return !child.visibleFields || child.visibleFields.includes(fieldCode);
  }

  private async assertUrgeNotTooFrequent(id: string, userId: string, actionType: string): Promise<void> {
    const recent = await this.operationLogRepository.count({
      where: {
        entityType: 'dispatched_order',
        entityId: id,
        userId,
        actionType,
        createdAt: MoreThan(new Date(Date.now() - 5 * 60 * 1000)),
      },
    });
    if (recent > 0) {
      throw businessException(4226, HttpStatus.TOO_MANY_REQUESTS, '已催办过该子工单，请 5 分钟后再试');
    }
  }

  private async readLatestDispatchedLog(id: string, actionType: string): Promise<OperationLog | null> {
    return this.operationLogRepository.findOne({
      where: { entityType: 'dispatched_order', entityId: id, actionType },
      order: { createdAt: 'DESC' },
    });
  }

  private buildFieldDiff(before: Record<string, unknown>, after: Record<string, unknown>): FieldDiffItem[] {
    const hookDiff = this.fieldChangeHook?.buildDiff(before, after);
    if (hookDiff && hookDiff.length > 0) return hookDiff;
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
    return keys
      .filter((field) => !this.sameFieldValue(before[field], after[field]))
      .map((field) => ({ field, before: before[field] ?? null, after: after[field] ?? null }));
  }

  private sameFieldValue(left: unknown, right: unknown): boolean {
    if (left === right) return true;
    if (left === null || left === undefined || right === null || right === undefined) {
      return String(left ?? '') === String(right ?? '');
    }
    if (left instanceof Date || right instanceof Date) {
      return new Date(left as string | number | Date).getTime() === new Date(right as string | number | Date).getTime();
    }
    if (typeof left === 'object' || typeof right === 'object') {
      return JSON.stringify(left) === JSON.stringify(right);
    }
    return String(left) === String(right);
  }

  private readRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  }

  private async readPendingModify(id: string): Promise<DispatchedOrderDetailItem['pendingModify']> {
    const log = await this.readLatestDispatchedLog(id, 'creator_modify_request');
    if (!log) return null;
    const afterData = (log.afterData ?? {}) as Record<string, unknown>;
    const fields = this.readRecord(afterData.pendingFields ?? afterData.pending_fields);
    if (!fields) return null;
    const previous = String(afterData.previousStatus ?? afterData.previous_status ?? '');
    return {
      fields,
      reason: typeof afterData.reason === 'string' ? afterData.reason : null,
      requestedBy: log.userId,
      requestedAt: log.createdAt,
      previousStatus: Object.values(DispatchedOrderStatus).includes(previous as DispatchedOrderStatus)
        ? previous as DispatchedOrderStatus
        : null,
    };
  }

  private async readPreviousDispatchedStatus(id: string, actionType: string, fallback: DispatchedOrderStatus): Promise<DispatchedOrderStatus> {
    const log = await this.readLatestDispatchedLog(id, actionType);
    const afterData = (log?.afterData ?? {}) as Record<string, unknown>;
    const previous = String(afterData.previousStatus ?? afterData.previous_status ?? '');
    return Object.values(DispatchedOrderStatus).includes(previous as DispatchedOrderStatus)
      ? previous as DispatchedOrderStatus
      : fallback;
  }

  private async notifyCreator(order: DispatchedOrder, bizType: string, title: string, content: string): Promise<void> {
    await this.notificationRepository.save(this.notificationRepository.create({
      userId: order.parentOrder.createdBy,
      bizType,
      title,
      content,
      link: `/my-dispatched/${order.id}`,
      payload: {
        workOrderId: order.parentOrder.id,
        orderNo: order.parentOrder.orderNo,
        dispatchedOrderId: order.id,
        entityType: 'dispatched_order',
        entityId: order.id,
        moduleCode: order.moduleCode,
      },
      isRead: false,
      readAt: null,
    }));
  }

  private async resolveDispatchedRecipients(order: DispatchedOrder): Promise<string[]> {
    const handlers = await this.moduleHandlerRepository.find({
      where: { moduleCode: order.moduleCode, isActive: true },
    });
    const configuredHandlerIds = handlers.map((handler) => handler.handlerId).filter((id): id is string => Boolean(id));
    return Array.from(new Set([order.handlerId, ...configuredHandlerIds].filter((id): id is string => Boolean(id))));
  }

  private async notifyUsers(order: DispatchedOrder, userIds: string[], bizType: string, title: string, content: string): Promise<void> {
    const recipients = Array.from(new Set(userIds.filter(Boolean))).filter((userId) => userId !== order.parentOrder.createdBy);
    if (recipients.length === 0) return;
    await this.notificationRepository.save(recipients.map((userId) => this.notificationRepository.create({
      userId,
      bizType,
      title,
      content,
      link: `/my-dispatched/${order.id}`,
      payload: {
        workOrderId: order.parentOrder.id,
        orderNo: order.parentOrder.orderNo,
        dispatchedOrderId: order.id,
        entityType: 'dispatched_order',
        entityId: order.id,
        moduleCode: order.moduleCode,
        priority: bizType.includes('void') || bizType.includes('withdraw') ? 'urgent' : 'normal',
      },
      isRead: false,
      readAt: null,
    })));
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
