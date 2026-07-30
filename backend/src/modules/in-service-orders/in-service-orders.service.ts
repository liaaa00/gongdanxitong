import {
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { readFile } from 'fs/promises';
import { join } from 'path';
import * as JSZip from 'jszip';
import { Brackets, In, Repository } from 'typeorm';
import {
  BUSINESS_LEADER_ROLES,
  BUSINESS_MANAGER_ROLES,
  WORK_ORDER_CREATOR_ROLES,
  hasAnyRole,
  hasManagementScopeRole,
  isAdminRole,
} from 'src/common/auth/role-permissions';
import { businessException } from 'src/common/exceptions/business-exception';
import { PROVINCE_SET } from 'src/common/constants/provinces';
import {
  BusinessScope,
  BusinessType,
  DispatchModuleCode,
  DispatchStrategy,
  IN_SERVICE_BUSINESS_TYPE_MAPPING,
  IN_SERVICE_PROCESS_TYPE_MAPPING,
  InServiceHandleChannel,
  InServiceOrder,
  InServiceOrderKind,
  InServiceOrderStatus,
  OrderType,
  ProcessType,
  RequirementType,
} from 'src/entities';
import { ExportTemplatesService } from 'src/modules/admin/export-templates/export-templates.service';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { HandlerPickerService } from 'src/modules/dispatch-engine/handler-picker.service';
import { assertInServiceOrderTransition } from 'src/modules/dispatched-orders/dispatched-order.service';
import {
  ApproveInServiceOrderDto,
  CloseInServiceOrderDto,
  CompleteInServiceOrderDto,
  ReasonInServiceOrderDto,
  StartInServiceProcessingDto,
  TransferInServiceOrderDto,
} from './dto/in-service-order-action.dto';
import {
  InServiceOrderListResponseDto,
  InServiceOrderResponseDto,
} from './dto/in-service-order-response.dto';
import { CreateInServiceOrderDto } from './dto/create-in-service-order.dto';
import { ListInServiceOrderQueryDto } from './dto/list-in-service-order.dto';
import { UpdateInServiceOrderDto } from './dto/update-in-service-order.dto';
import {
  RequestMaterialChangeDto,
  ReviewMaterialChangeDto,
} from './dto/material-change.dto';

const MATERIAL_CHANGE_REQUEST_KEY = '__materialChangeRequest';
const MATERIAL_CHANGE_HISTORY_KEY = '__materialChangeHistory';

type MaterialChangeRequestRecord = {
  requestedBy: string;
  requestedAt: string;
  reason: string | null;
  changes: UpdateInServiceOrderDto;
};

type DirectOrderPayload = {
  employeeName?: string | null;
  idCardNo?: string | null;
  extraData?: Record<string, unknown>;
  expectedCompletionDate?: string | null;
  businessReason?: string | null;
  businessType?: BusinessType | null;
  processType?: ProcessType | null;
  requirementType?: RequirementType | null;
  province?: string | null;
  city?: string | null;
  district?: string | null;
  businessDescription?: string | null;
  serviceFee?: number | null;
};

const BUSINESS_FRONT_ROLE_CODES = new Set([
  'business_owner',
  'business_group_leader',
  'business_group_member',
  'biz_manager',
  'biz_leader',
  'biz_member',
  'manager',
  'salesperson',
]);

@Injectable()
export class InServiceOrdersService {
  constructor(
    @InjectRepository(InServiceOrder)
    private readonly repository: Repository<InServiceOrder>,
    private readonly handlerPicker: HandlerPickerService,
    private readonly exportTemplatesService: ExportTemplatesService,
  ) {}

  async create(
    dto: CreateInServiceOrderDto,
    user: JwtUserPayload,
  ): Promise<InServiceOrderResponseDto> {
    this.assertCanCreate(user);
    const orderKind = dto.orderKind ?? InServiceOrderKind.SINGLE_BUSINESS;
    const businessScope = this.resolveCreateBusinessScope(orderKind, dto.businessScope, user);
    this.validateKindPayload(orderKind, dto);

    const handlerId = await this.pickHandler(
      orderKind,
      businessScope,
      dto.province ?? null,
    );
    const now = new Date();
    const order = this.repository.create({
      ...dto,
      orderKind,
      businessScope,
      employeeName: dto.employeeName?.trim() || null,
      idCardNo: dto.idCardNo?.trim() || null,
      extraData: dto.extraData ?? {},
      requirementType: dto.requirementType ?? null,
      businessType: dto.businessType ?? null,
      processType: dto.processType ?? null,
      province: dto.province ?? null,
      city: dto.city ?? null,
      district: dto.district ?? null,
      expectedCompletionDate: dto.expectedCompletionDate ?? null,
      businessReason: dto.businessReason ?? null,
      businessDescription: dto.businessDescription ?? null,
      serviceFee: dto.serviceFee ?? null,
      orderNo: this.generateOrderNo(orderKind),
      orderType: OrderType.IN_SERVICE,
      contactPhone: null,
      handleChannel: InServiceHandleChannel.ONLINE,
      attachments: dto.attachments ?? [],
      status: InServiceOrderStatus.DISPATCHED,
      pendingReturnStatus: null,
      transferHistory: [],
      handlerId,
      createdBy: user.sub,
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
    return this.saveAndRespond(order);
  }

  async list(
    query: ListInServiceOrderQueryDto,
    user: JwtUserPayload,
  ): Promise<InServiceOrderListResponseDto> {
    const qb = this.repository.createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.department', 'department')
      .leftJoinAndSelect('order.handler', 'handler')
      .leftJoinAndSelect('order.creator', 'creator')
      .where('order.order_type = :orderType', { orderType: OrderType.IN_SERVICE });

    const businessScope = this.resolveListBusinessScope(query, user);
    qb.andWhere('order.business_scope = :businessScope', { businessScope });

    if (!isAdminRole(user.roles) && !hasManagementScopeRole(user.roles)) {
      qb.andWhere(new Brackets((scope) => {
        scope.where('order.created_by = :userId', { userId: user.sub })
          .orWhere('order.handler_id = :userId', { userId: user.sub });
      }));
    }
    if (query.customerId) qb.andWhere('order.customer_id = :customerId', { customerId: query.customerId });
    if (query.departmentId) qb.andWhere('order.department_id = :departmentId', { departmentId: query.departmentId });
    if (query.handlerId) qb.andWhere('order.handler_id = :handlerId', { handlerId: query.handlerId });
    if (query.orderKind) qb.andWhere('order.order_kind = :orderKind', { orderKind: query.orderKind });
    if (query.businessType) qb.andWhere('order.business_type = :businessType', { businessType: query.businessType });
    if (query.processType) qb.andWhere('order.process_type = :processType', { processType: query.processType });
    if (query.requirementType) qb.andWhere('order.requirement_type = :requirementType', { requirementType: query.requirementType });
    if (query.status) qb.andWhere('order.status = :status', { status: query.status });
    if (query.province) qb.andWhere('order.province = :province', { province: query.province });
    if (query.createdFrom) qb.andWhere('order.created_at >= :createdFrom', { createdFrom: query.createdFrom });
    if (query.createdTo) qb.andWhere('order.created_at <= :createdTo', { createdTo: query.createdTo });
    if (query.keyword?.trim()) {
      qb.andWhere(new Brackets((keyword) => {
        keyword.where('order.order_no ILIKE :keyword', { keyword: `%${query.keyword!.trim()}%` })
          .orWhere('order.employee_name ILIKE :keyword', { keyword: `%${query.keyword!.trim()}%` })
          .orWhere('order.id_card_no ILIKE :keyword', { keyword: `%${query.keyword!.trim()}%` })
          .orWhere('order.business_reason ILIKE :keyword', { keyword: `%${query.keyword!.trim()}%` })
          .orWhere('order.business_description ILIKE :keyword', { keyword: `%${query.keyword!.trim()}%` })
          .orWhere('customer.customer_name ILIKE :keyword', { keyword: `%${query.keyword!.trim()}%` })
          .orWhere('customer.customer_code ILIKE :keyword', { keyword: `%${query.keyword!.trim()}%` })
          .orWhere('creator.real_name ILIKE :keyword', { keyword: `%${query.keyword!.trim()}%` });
      }));
    }

    qb.orderBy('order.createdAt', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);
    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map(InServiceOrderResponseDto.fromEntity),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getInjuryWarning(idCardNo: string): Promise<{ hasInjuryRecord: boolean; message: string | null }> {
    const count = await this.repository.count({
      where: {
        idCardNo: idCardNo.trim(),
        orderKind: InServiceOrderKind.SINGLE_BUSINESS,
        processType: In([
          ProcessType.WORK_INJURY_RECOGNITION,
          ProcessType.WORK_INJURY_REMOTE_FILING,
          ProcessType.LABOR_CAPACITY_ASSESSMENT,
          ProcessType.WORK_INJURY_BENEFIT,
        ]),
      },
    });
    const hasInjuryRecord = count > 0;
    return {
      hasInjuryRecord,
      message: hasInjuryRecord
        ? '该员工存在工伤申请记录，减员时需同步办理一次性医疗补助金申请'
        : null,
    };
  }

  async findOne(id: string, user: JwtUserPayload): Promise<InServiceOrderResponseDto> {
    const order = await this.findEntity(id);
    this.assertCanView(order, user);
    return InServiceOrderResponseDto.fromEntity(order);
  }

  async update(
    id: string,
    dto: UpdateInServiceOrderDto,
    user: JwtUserPayload,
  ): Promise<InServiceOrderResponseDto> {
    const order = await this.findEntity(id);
    this.assertOwnerOrManagement(order, user);
    if (order.status !== InServiceOrderStatus.PENDING_INFO) {
      throw businessException(4803, HttpStatus.BAD_REQUEST, '仅待补充材料的单项业务可修改');
    }

    const next = { ...order, ...dto };
    this.validateKindPayload(
      order.orderKind ?? InServiceOrderKind.SINGLE_BUSINESS,
      next,
    );
    Object.assign(order, dto);
    return this.saveAndRespond(order);
  }

  async remove(id: string, user: JwtUserPayload): Promise<{ id: string }> {
    const order = await this.findEntity(id);
    this.assertOwnerOrManagement(order, user);
    if (order.status !== InServiceOrderStatus.DRAFT) {
      throw businessException(4804, HttpStatus.BAD_REQUEST, '仅历史草稿可删除');
    }
    await this.repository.softRemove(order);
    return { id };
  }

  // 历史兼容：旧草稿仍可经原审批接口进入待受理，新流程不会创建草稿。
  async approve(
    id: string,
    dto: ApproveInServiceOrderDto,
    user: JwtUserPayload,
  ): Promise<InServiceOrderResponseDto> {
    const order = await this.findEntity(id);
    this.assertApprover(user);
    assertInServiceOrderTransition(order.status, InServiceOrderStatus.DISPATCHED);
    order.handlerId = await this.pickHandler(
      order.orderKind ?? InServiceOrderKind.SINGLE_BUSINESS,
      order.businessScope ?? BusinessScope.BEILUN,
      order.province,
    ) ?? dto.handlerId ?? null;
    order.status = InServiceOrderStatus.DISPATCHED;
    order.approvedBy = user.sub;
    order.approvedAt = new Date();
    order.dispatchedAt = order.approvedAt;
    return this.saveAndRespond(order);
  }

  async reject(
    id: string,
    dto: ReasonInServiceOrderDto,
    user: JwtUserPayload,
  ): Promise<InServiceOrderResponseDto> {
    const order = await this.findEntity(id);
    this.assertApprover(user);
    return this.cancelOrder(order, dto.reason, user);
  }

  async accept(id: string, user: JwtUserPayload): Promise<InServiceOrderResponseDto> {
    const order = await this.findEntity(id);
    this.assertHandlerOrManagement(order, user);
    assertInServiceOrderTransition(order.status, InServiceOrderStatus.ACCEPTED);
    order.status = InServiceOrderStatus.ACCEPTED;
    order.acceptedAt = new Date();
    return this.saveAndRespond(order);
  }

  async confirm(id: string, user: JwtUserPayload): Promise<InServiceOrderResponseDto> {
    const order = await this.findEntity(id);
    this.assertHandlerOrManagement(order, user);
    this.assertNoPendingMaterialChange(order);
    assertInServiceOrderTransition(order.status, InServiceOrderStatus.READY);
    order.status = InServiceOrderStatus.READY;
    order.confirmedAt = new Date();
    return this.saveAndRespond(order);
  }

  async transfer(
    id: string,
    dto: TransferInServiceOrderDto,
    user: JwtUserPayload,
  ): Promise<InServiceOrderResponseDto> {
    const order = await this.findEntity(id);
    this.assertHandlerOrManagement(order, user);
    this.assertNoPendingMaterialChange(order);
    if (![InServiceOrderStatus.DISPATCHED, InServiceOrderStatus.ACCEPTED].includes(order.status)) {
      throw businessException(4808, HttpStatus.BAD_REQUEST, '仅待受理或已受理工单可转派');
    }
    const fromHandlerId = order.handlerId;
    order.handlerId = dto.handlerId;
    order.handler = null;
    order.status = InServiceOrderStatus.DISPATCHED;
    order.acceptedAt = null;
    order.transferHistory = [
      ...(order.transferHistory ?? []),
      {
        fromHandlerId,
        toHandlerId: dto.handlerId,
        operatorId: user.sub,
        reason: dto.reason?.trim() || null,
        transferredAt: new Date().toISOString(),
      },
    ];
    return this.saveAndRespond(order);
  }

  async startProcessing(
    id: string,
    dto: StartInServiceProcessingDto,
    user: JwtUserPayload,
  ): Promise<InServiceOrderResponseDto> {
    const order = await this.findEntity(id);
    this.assertHandlerOrManagement(order, user);
    assertInServiceOrderTransition(order.status, InServiceOrderStatus.PROCESSING);
    order.status = InServiceOrderStatus.PROCESSING;
    order.handleChannel = dto.handleChannel;
    order.processingAt = new Date();
    return this.saveAndRespond(order);
  }

  async requestInfo(
    id: string,
    dto: ReasonInServiceOrderDto,
    user: JwtUserPayload,
  ): Promise<InServiceOrderResponseDto> {
    const order = await this.findEntity(id);
    this.assertHandlerOrManagement(order, user);
    this.assertNoPendingMaterialChange(order);
    if (![InServiceOrderStatus.ACCEPTED, InServiceOrderStatus.PROCESSING].includes(order.status)) {
      throw businessException(4809, HttpStatus.BAD_REQUEST, '当前节点不可发起补充材料');
    }
    const returnStatus = order.status;
    assertInServiceOrderTransition(order.status, InServiceOrderStatus.PENDING_INFO);
    order.status = InServiceOrderStatus.PENDING_INFO;
    order.pendingReturnStatus = returnStatus;
    order.pendingInfoReason = dto.reason;
    order.pendingInfoAt = new Date();
    return this.saveAndRespond(order);
  }

  async resubmit(
    id: string,
    dto: UpdateInServiceOrderDto,
    user: JwtUserPayload,
  ): Promise<InServiceOrderResponseDto> {
    const order = await this.findEntity(id);
    this.assertOwnerOrManagement(order, user);
    if (order.status !== InServiceOrderStatus.PENDING_INFO) {
      throw businessException(4810, HttpStatus.BAD_REQUEST, '仅待补充材料工单可重新提交');
    }

    const next = { ...order, ...dto };
    this.validateKindPayload(
      order.orderKind ?? InServiceOrderKind.SINGLE_BUSINESS,
      next,
    );
    if (dto.attachments) {
      const attachments = Array.from(new Set([...(order.attachments ?? []), ...dto.attachments]));
      if (attachments.length > 5) {
        throw businessException(4805, HttpStatus.BAD_REQUEST, '附件总数不能超过 5 个');
      }
      Object.assign(order, dto, { attachments });
    } else {
      Object.assign(order, dto);
    }

    const target = order.pendingReturnStatus ?? InServiceOrderStatus.DISPATCHED;
    assertInServiceOrderTransition(order.status, target);
    order.status = target;
    order.pendingReturnStatus = null;
    order.pendingInfoReason = null;
    return this.saveAndRespond(order);
  }

  async requestMaterialChange(
    id: string,
    dto: RequestMaterialChangeDto,
    user: JwtUserPayload,
  ): Promise<InServiceOrderResponseDto> {
    const order = await this.findEntity(id);
    this.assertCreator(order, user);
    if (![InServiceOrderStatus.ACCEPTED, InServiceOrderStatus.PROCESSING].includes(order.status)) {
      throw businessException(4814, HttpStatus.BAD_REQUEST, '仅已受理或办理中的工单可申请修改材料');
    }
    if (this.readMaterialChangeRequest(order)) {
      throw businessException(4815, HttpStatus.CONFLICT, '当前已有待审批的材料修改申请');
    }

    const changes = this.sanitizeMaterialChanges(dto.changes);
    this.validateMaterialChanges(order, changes);
    order.extraData = {
      ...(order.extraData ?? {}),
      [MATERIAL_CHANGE_REQUEST_KEY]: {
        requestedBy: user.sub,
        requestedAt: new Date().toISOString(),
        reason: dto.reason?.trim() || null,
        changes,
      } satisfies MaterialChangeRequestRecord,
    };
    return this.saveAndRespond(order);
  }

  async reviewMaterialChange(
    id: string,
    dto: ReviewMaterialChangeDto,
    user: JwtUserPayload,
  ): Promise<InServiceOrderResponseDto> {
    const order = await this.findEntity(id);
    this.assertHandlerOrManagement(order, user);
    const request = this.readMaterialChangeRequest(order);
    if (!request) {
      throw businessException(4816, HttpStatus.BAD_REQUEST, '当前没有待审批的材料修改申请');
    }
    if (!dto.approved && !dto.reason?.trim()) {
      throw businessException(4817, HttpStatus.BAD_REQUEST, '驳回材料修改申请时必须填写原因');
    }

    const oldHistory = this.readMaterialChangeHistory(order.extraData ?? {});
    const cleanExtraData = this.withoutMaterialChangeMetadata(order.extraData ?? {});
    if (dto.approved) {
      const changes = request.changes;
      const { extraData, attachments, ...topLevelChanges } = changes;
      Object.assign(order, topLevelChanges);
      order.extraData = { ...cleanExtraData, ...(extraData ?? {}) };
      if (attachments) {
        order.attachments = this.mergeAttachments([], attachments);
      }
      this.validateKindPayload(order.orderKind, order);
    } else {
      order.extraData = cleanExtraData;
    }

    order.extraData = {
      ...(order.extraData ?? {}),
      [MATERIAL_CHANGE_HISTORY_KEY]: [...oldHistory, {
        ...request,
        approved: dto.approved,
        reviewedBy: user.sub,
        reviewedAt: new Date().toISOString(),
        reviewReason: dto.reason?.trim() || null,
      }].slice(-20),
    };
    return this.saveAndRespond(order);
  }

  async complete(
    id: string,
    dto: CompleteInServiceOrderDto,
    user: JwtUserPayload,
  ): Promise<InServiceOrderResponseDto> {
    const order = await this.findEntity(id);
    this.assertHandlerOrManagement(order, user);
    this.assertNoPendingMaterialChange(order);
    assertInServiceOrderTransition(order.status, InServiceOrderStatus.COMPLETED);
    order.status = InServiceOrderStatus.COMPLETED;
    order.completionRemark = dto.remark?.trim() || null;
    order.attachments = this.mergeAttachments(order.attachments, dto.attachments);
    order.completedAt = new Date();
    return this.saveAndRespond(order);
  }

  async fail(
    id: string,
    dto: CompleteInServiceOrderDto,
    user: JwtUserPayload,
  ): Promise<InServiceOrderResponseDto> {
    const order = await this.findEntity(id);
    this.assertHandlerOrManagement(order, user);
    this.assertNoPendingMaterialChange(order);
    assertInServiceOrderTransition(order.status, InServiceOrderStatus.FAILED);
    order.status = InServiceOrderStatus.FAILED;
    order.completionRemark = dto.remark?.trim() || null;
    order.attachments = this.mergeAttachments(order.attachments, dto.attachments);
    order.completedAt = new Date();
    return this.saveAndRespond(order);
  }

  async cancel(
    id: string,
    dto: ReasonInServiceOrderDto,
    user: JwtUserPayload,
  ): Promise<InServiceOrderResponseDto> {
    const order = await this.findEntity(id);
    this.assertCreator(order, user);
    return this.cancelOrder(order, dto.reason, user);
  }

  async exportRenewalTemplate(id: string, user: JwtUserPayload) {
    const order = await this.findEntity(id);
    this.assertHandlerOrManagement(order, user);
    return this.exportTemplatesService.exportContractRenewal(order, user);
  }

  async generateCertificate(
    id: string,
    user: JwtUserPayload,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const order = await this.findEntity(id);
    this.assertHandlerOrManagement(order, user);
    if (order.orderKind !== InServiceOrderKind.CERTIFICATE) {
      throw businessException(4812, HttpStatus.BAD_REQUEST, '当前工单不是证明开具工单');
    }

    const certificateType = String(order.extraData?.certificateType ?? '');
    if (certificateType === 'social_insurance') {
      throw businessException(4812, HttpStatus.BAD_REQUEST, '社保证明模板尚未配置，暂不能导出');
    }
    const templateName = certificateType === 'employment'
      ? 'employment-certificate.docx'
      : certificateType === 'income'
        ? 'income-certificate.docx'
        : null;
    if (!templateName) {
      throw businessException(4812, HttpStatus.BAD_REQUEST, '证明类型不支持导出');
    }

    const template = await readFile(join(
      __dirname,
      '..',
      '..',
      'assets',
      'certificates',
      templateName,
    ));
    const zip = await JSZip.loadAsync(template);
    const document = zip.file('word/document.xml');
    if (!document) {
      throw businessException(4813, HttpStatus.INTERNAL_SERVER_ERROR, '证明模板结构无效');
    }

    let xml = await document.async('string');
    const replacements: Record<string, unknown> = {
      employeeName: order.employeeName,
      idCardNo: order.idCardNo,
      hireDate: order.extraData?.hireDate,
      jobTitle: order.extraData?.jobTitle,
      purpose: order.extraData?.purpose,
      averageMonthlyIncome: order.extraData?.averageMonthlyIncome,
    };
    for (const [key, rawValue] of Object.entries(replacements)) {
      const token = `{{${key}}}`;
      const value = this.escapeXml(rawValue == null ? '' : String(rawValue));
      xml = xml.split(token).join(value);
    }
    zip.file('word/document.xml', xml);

    return {
      buffer: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
      fileName: `${certificateType}-${order.orderNo}.docx`,
    };
  }

  async close(
    id: string,
    dto: CloseInServiceOrderDto,
    user: JwtUserPayload,
  ): Promise<InServiceOrderResponseDto> {
    const order = await this.findEntity(id);
    this.assertOwnerOrManagement(order, user);
    assertInServiceOrderTransition(order.status, InServiceOrderStatus.ARCHIVED);
    order.status = InServiceOrderStatus.ARCHIVED;
    order.closedBy = user.sub;
    order.closedAt = new Date();
    order.closeReason = dto.reason?.trim() || null;
    return this.saveAndRespond(order);
  }

  private async cancelOrder(
    order: InServiceOrder,
    reason: string,
    user: JwtUserPayload,
  ): Promise<InServiceOrderResponseDto> {
    assertInServiceOrderTransition(order.status, InServiceOrderStatus.CANCELLED);
    order.status = InServiceOrderStatus.CANCELLED;
    order.closedBy = user.sub;
    order.closedAt = new Date();
    order.closeReason = reason.trim();
    return this.saveAndRespond(order);
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private sanitizeMaterialChanges(dto: UpdateInServiceOrderDto): UpdateInServiceOrderDto {
    const { customerId: _customerId, departmentId: _departmentId, ...changes } = dto;
    return changes;
  }

  private validateMaterialChanges(order: InServiceOrder, changes: UpdateInServiceOrderDto): void {
    const candidate = {
      ...order,
      ...changes,
      extraData: { ...(order.extraData ?? {}), ...(changes.extraData ?? {}) },
    };
    this.validateKindPayload(order.orderKind, candidate);
  }

  private readMaterialChangeRequest(order: InServiceOrder): MaterialChangeRequestRecord | null {
    const raw = order.extraData?.[MATERIAL_CHANGE_REQUEST_KEY];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const record = raw as Partial<MaterialChangeRequestRecord>;
    if (!record.changes || typeof record.changes !== 'object') return null;
    return record as MaterialChangeRequestRecord;
  }

  private readMaterialChangeHistory(extraData: Record<string, unknown>): unknown[] {
    const raw = extraData[MATERIAL_CHANGE_HISTORY_KEY];
    return Array.isArray(raw) ? raw : [];
  }

  private withoutMaterialChangeMetadata(extraData: Record<string, unknown>): Record<string, unknown> {
    const {
      [MATERIAL_CHANGE_REQUEST_KEY]: _request,
      [MATERIAL_CHANGE_HISTORY_KEY]: _history,
      ...clean
    } = extraData;
    return clean;
  }

  private assertNoPendingMaterialChange(order: InServiceOrder): void {
    if (this.readMaterialChangeRequest(order)) {
      throw businessException(4815, HttpStatus.CONFLICT, '请先审批待处理的材料修改申请');
    }
  }

  private mergeAttachments(current: string[] = [], next?: string[]): string[] {
    const merged = Array.from(new Set([...current, ...(next ?? [])]));
    if (merged.length > 5) {
      throw businessException(4805, HttpStatus.BAD_REQUEST, '附件总数不能超过 5 个');
    }
    return merged;
  }

  private async saveAndRespond(order: InServiceOrder): Promise<InServiceOrderResponseDto> {
    const saved = await this.repository.save(order);
    const withRelations = await this.repository.findOne({
      where: { id: saved.id },
      relations: { customer: true, department: true, handler: true, creator: true },
    });
    return InServiceOrderResponseDto.fromEntity(withRelations ?? saved);
  }

  private async findEntity(id: string): Promise<InServiceOrder> {
    const order = await this.repository.findOne({
      where: { id },
      relations: { customer: true, department: true, handler: true, creator: true },
    });
    if (!order) throw new NotFoundException('独立工单不存在');
    return order;
  }

  private validateKindPayload(
    orderKind: InServiceOrderKind,
    payload: DirectOrderPayload,
  ): void {
    const employeeName = payload.employeeName?.trim();
    const idCardNo = payload.idCardNo?.trim();
    const extraData = payload.extraData ?? {};
    const requireIdentity = () => {
      if (!employeeName || !idCardNo) {
        throw businessException(4811, HttpStatus.BAD_REQUEST, '员工姓名和证件号不能为空');
      }
    };

    if (orderKind === InServiceOrderKind.SINGLE_BUSINESS) {
      if (
        !payload.expectedCompletionDate
        || !payload.businessReason?.trim()
        || !payload.businessType
        || !payload.processType
        || !payload.province
        || !payload.city?.trim()
        || !payload.district?.trim()
        || !payload.businessDescription?.trim()
        || payload.serviceFee === null
        || payload.serviceFee === undefined
      ) {
        throw businessException(4811, HttpStatus.BAD_REQUEST, '单项业务必填信息不完整');
      }
      this.validateCategoryPath(
        payload.businessType,
        payload.processType,
        payload.requirementType ?? null,
      );
      return;
    }

    requireIdentity();

    if (orderKind === InServiceOrderKind.CONTRACT_RENEWAL) {
      const contractStartDate = extraData.contract_start_date
        ?? extraData.renewal_start_date
        ?? extraData.contractStartDate;
      const contractEndDate = extraData.contract_end_date
        ?? extraData.renewal_end_date
        ?? extraData.contractEndDate;
      const contractTermType = String(
        extraData.contract_term_type ?? extraData.renewal_term_type ?? '',
      );
      if (!contractStartDate || (contractTermType !== '无固定期限' && !contractEndDate)) {
        throw businessException(
          4811,
          HttpStatus.BAD_REQUEST,
          contractTermType === '无固定期限'
            ? '合同开始日期不能为空'
            : '合同开始日期和结束日期不能为空',
        );
      }
      return;
    }

    if (orderKind === InServiceOrderKind.CERTIFICATE) {
      const certificateType = String(extraData.certificateType ?? '');
      if (certificateType === 'social_insurance') {
        throw businessException(4812, HttpStatus.BAD_REQUEST, '社保证明模板尚未配置，暂不能提交');
      }
      if (!['employment', 'income'].includes(certificateType)) {
        throw businessException(4812, HttpStatus.BAD_REQUEST, '请选择有效的证明类型');
      }
      if (!extraData.hireDate || !extraData.jobTitle || !extraData.purpose) {
        throw businessException(4811, HttpStatus.BAD_REQUEST, '入职日期、职务和证明用途不能为空');
      }
      if (certificateType === 'income' && extraData.averageMonthlyIncome === undefined) {
        throw businessException(4811, HttpStatus.BAD_REQUEST, '收入证明需填写近一年税前月均收入');
      }
      return;
    }

    if (orderKind === InServiceOrderKind.RESIGNATION_CERTIFICATE) {
      if (!extraData.resignationDate) {
        throw businessException(4811, HttpStatus.BAD_REQUEST, '离职日期不能为空');
      }
      return;
    }

    if (!payload.province || !PROVINCE_SET.has(payload.province) || !payload.city?.trim() || !extraData.paymentInstitution) {
      throw businessException(4811, HttpStatus.BAD_REQUEST, '参保省份、城市和缴纳机构不能为空');
    }
    if (
      orderKind === InServiceOrderKind.OUT_OF_PROVINCE_INCREASE
      && (!extraData.contractStartDate || !extraData.contractEndDate)
    ) {
      throw businessException(4811, HttpStatus.BAD_REQUEST, '省外增员需填写合同开始和结束时间');
    }
    if (
      orderKind === InServiceOrderKind.OUT_OF_PROVINCE_DECREASE
      && !extraData.lastWorkDate
    ) {
      throw businessException(4811, HttpStatus.BAD_REQUEST, '省外减员需填写最后工作日');
    }
  }

  private validateCategoryPath(
    businessType: BusinessType,
    processType: ProcessType,
    requirementType: RequirementType | null,
  ): void {
    if (!IN_SERVICE_BUSINESS_TYPE_MAPPING[businessType]?.includes(processType)) {
      throw businessException(4806, HttpStatus.BAD_REQUEST, '单项业务一级、二级分类不匹配');
    }
    const requirements = IN_SERVICE_PROCESS_TYPE_MAPPING[processType];
    if (requirements.length === 0 && requirementType !== null) {
      throw businessException(4807, HttpStatus.BAD_REQUEST, '当前二级分类不需要三级分类');
    }
    if (requirements.length > 0 && (!requirementType || !requirements.includes(requirementType))) {
      throw businessException(4807, HttpStatus.BAD_REQUEST, '请选择有效的三级分类');
    }
  }

  private resolveCreateBusinessScope(
    orderKind: InServiceOrderKind,
    requestedScope: BusinessScope | undefined,
    user: JwtUserPayload,
  ): BusinessScope {
    if ([
      InServiceOrderKind.OUT_OF_PROVINCE_INCREASE,
      InServiceOrderKind.OUT_OF_PROVINCE_DECREASE,
    ].includes(orderKind)) {
      return BusinessScope.OUT_OF_PROVINCE;
    }
    if ([
      InServiceOrderKind.CONTRACT_RENEWAL,
      InServiceOrderKind.CERTIFICATE,
      InServiceOrderKind.RESIGNATION_CERTIFICATE,
    ].includes(orderKind)) {
      return BusinessScope.BEILUN;
    }
    if (user.roles.some((role) => BUSINESS_FRONT_ROLE_CODES.has(role))) {
      return user.businessScope ?? BusinessScope.BEILUN;
    }
    return requestedScope ?? user.businessScope ?? BusinessScope.BEILUN;
  }

  private resolveListBusinessScope(
    query: ListInServiceOrderQueryDto,
    user: JwtUserPayload,
  ): BusinessScope {
    if (user.roles.some((role) => BUSINESS_FRONT_ROLE_CODES.has(role))) {
      return user.businessScope ?? BusinessScope.BEILUN;
    }
    return query.businessScope
      ?? query.business_scope
      ?? user.businessScope
      ?? BusinessScope.BEILUN;
  }

  private async pickHandler(
    orderKind: InServiceOrderKind,
    businessScope: BusinessScope,
    province: string | null,
  ): Promise<string | null> {
    if (
      orderKind === InServiceOrderKind.SINGLE_BUSINESS
      || orderKind === InServiceOrderKind.OUT_OF_PROVINCE_INCREASE
      || orderKind === InServiceOrderKind.OUT_OF_PROVINCE_DECREASE
    ) {
      const outOfProvince = businessScope === BusinessScope.OUT_OF_PROVINCE;
      return this.handlerPicker.pick(
        DispatchStrategy.FIXED,
        outOfProvince
          ? DispatchModuleCode.OUT_OF_PROVINCE_DISPATCH
          : DispatchModuleCode.IN_SERVICE_SINGLE_BUSINESS,
        undefined,
        {
          province: province ?? undefined,
          mappingSource: outOfProvince ? 'sheet5' : 'sheet4',
        },
      );
    }

    const moduleCode = orderKind === InServiceOrderKind.CONTRACT_RENEWAL
      ? DispatchModuleCode.RENEWAL_CONTRACT
      : orderKind === InServiceOrderKind.CERTIFICATE
        ? DispatchModuleCode.IN_SERVICE_CERTIFICATE
        : DispatchModuleCode.RESIGNATION_CERT;
    return this.handlerPicker.pick(DispatchStrategy.FIXED, moduleCode);
  }

  private assertCanCreate(user: JwtUserPayload): void {
    if (!hasAnyRole(user.roles, WORK_ORDER_CREATOR_ROLES)) {
      throw new ForbiddenException('当前角色无权创建单项业务工单');
    }
  }

  private assertCanView(order: InServiceOrder, user: JwtUserPayload): void {
    if (
      isAdminRole(user.roles)
      || hasManagementScopeRole(user.roles)
      || order.createdBy === user.sub
      || order.handlerId === user.sub
    ) return;
    throw new ForbiddenException('无权访问该单项业务工单');
  }

  private assertOwnerOrManagement(order: InServiceOrder, user: JwtUserPayload): void {
    if (
      isAdminRole(user.roles)
      || hasManagementScopeRole(user.roles)
      || order.createdBy === user.sub
    ) return;
    throw new ForbiddenException('仅发起人或管理角色可执行该操作');
  }

  private assertCreator(order: InServiceOrder, user: JwtUserPayload): void {
    if (order.createdBy === user.sub) return;
    throw new ForbiddenException('仅发起人可作废该工单');
  }

  private assertApprover(user: JwtUserPayload): void {
    if (
      isAdminRole(user.roles)
      || hasAnyRole(user.roles, BUSINESS_MANAGER_ROLES)
      || hasAnyRole(user.roles, BUSINESS_LEADER_ROLES)
    ) return;
    throw new ForbiddenException('当前角色无权处理历史单项业务草稿');
  }

  private assertHandlerOrManagement(order: InServiceOrder, user: JwtUserPayload): void {
    if (
      isAdminRole(user.roles)
      || hasManagementScopeRole(user.roles)
      || order.handlerId === user.sub
    ) return;
    throw new ForbiddenException('仅当前办理人或管理角色可执行该操作');
  }

  private generateOrderNo(orderKind: InServiceOrderKind): string {
    const prefixes: Record<InServiceOrderKind, string> = {
      [InServiceOrderKind.SINGLE_BUSINESS]: 'IS',
      [InServiceOrderKind.CONTRACT_RENEWAL]: 'RN',
      [InServiceOrderKind.CERTIFICATE]: 'CERT',
      [InServiceOrderKind.RESIGNATION_CERTIFICATE]: 'RCERT',
      [InServiceOrderKind.OUT_OF_PROVINCE_INCREASE]: 'OPI',
      [InServiceOrderKind.OUT_OF_PROVINCE_DECREASE]: 'OPD',
    };
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `${prefixes[orderKind]}-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }
}
