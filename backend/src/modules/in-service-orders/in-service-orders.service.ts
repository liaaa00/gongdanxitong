import {
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
  Optional,
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
  Department,
  DispatchModuleCode,
  DispatchStrategy,
  FieldConfig,
  FieldPermissionMode,
  IN_SERVICE_BUSINESS_TYPE_MAPPING,
  IN_SERVICE_PROCESS_TYPE_MAPPING,
  InServiceHandleChannel,
  InServiceOrder,
  InServiceOrderKind,
  InServiceOrderStatus,
  ModuleHandler,
  Notification,
  OperationLog,
  OrderType,
  WorkOrder,
  WorkOrderStatus,
  ProcessType,
  RequirementType,
} from 'src/entities';
import { DetailViewTemplatesService } from 'src/modules/admin/detail-view-templates/detail-view-templates.service';
import { ExportTemplatesService } from 'src/modules/admin/export-templates/export-templates.service';
import { FieldPermissionService } from 'src/modules/field-permissions/field-permission.service';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { HandlerPickerService } from 'src/modules/dispatch-engine/handler-picker.service';
import { assertInServiceOrderTransition } from 'src/modules/dispatched-orders/dispatched-order.service';
import {
  HANDLING_RESULT_COMPLETED,
  normalizeHandlingResult,
} from 'src/modules/dispatched-orders/handling-feedback';
import { buildContractTermText } from 'src/modules/dispatched-orders/resignation-certificate';
import { WorkflowDefinition, WorkflowDefinitionStatus } from 'src/modules/workflows/workflow.entity';
import { RoleActionPermissionService } from 'src/modules/role-action-permissions/role-action-permission.service';
import { WorkOrderValidationService } from 'src/modules/work-orders/work-order-validation.service';
import {
  ApproveInServiceOrderDto,
  CancelInServiceOrderDto,
  CloseInServiceOrderDto,
  InServiceCancelAction,
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
import {
  getDefaultInServiceOrderTransitions,
  getInServiceFlowKey,
  usesBeilunChildOrderFlow,
} from './in-service-flow';
import { createOutOfProvinceExportWorkbook } from './out-of-province-export';
import { OUT_OF_PROVINCE_ACCOUNTS } from './out-of-province-account-data';

const MATERIAL_CHANGE_REQUEST_KEY = '__materialChangeRequest';
const MATERIAL_CHANGE_HISTORY_KEY = '__materialChangeHistory';

const CERTIFICATE_EXTRA_DATA_FIELDS = [
  'certificateType',
  'purpose',
  'hireDate',
  'jobTitle',
  'referenceBaseSalary',
  'averageMonthlyIncome',
] as const;

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

export function expandInServiceStatusFilter(
  orderKind: InServiceOrderKind | undefined,
  status: InServiceOrderStatus,
): InServiceOrderStatus[] {
  if (orderKind !== InServiceOrderKind.CERTIFICATE) return [status];
  const certificateStatuses: Partial<Record<InServiceOrderStatus, InServiceOrderStatus[]>> = {
    [InServiceOrderStatus.DISPATCHED]: [
      InServiceOrderStatus.DRAFT,
      InServiceOrderStatus.DISPATCHED,
    ],
    [InServiceOrderStatus.PROCESSING]: [
      InServiceOrderStatus.ACCEPTED,
      InServiceOrderStatus.READY,
      InServiceOrderStatus.PROCESSING,
    ],
    [InServiceOrderStatus.COMPLETED]: [
      InServiceOrderStatus.COMPLETED,
      InServiceOrderStatus.ARCHIVED,
    ],
    [InServiceOrderStatus.PENDING_INFO]: [
      InServiceOrderStatus.PENDING_INFO,
      InServiceOrderStatus.FAILED,
      InServiceOrderStatus.CANCELLED,
    ],
  };
  return certificateStatuses[status] ?? [status];
}

@Injectable()
export class InServiceOrdersService {
  constructor(
    @InjectRepository(InServiceOrder)
    private readonly repository: Repository<InServiceOrder>,
    @InjectRepository(WorkOrder)
    private readonly workOrderRepository: Repository<WorkOrder>,
    private readonly handlerPicker: HandlerPickerService,
    private readonly exportTemplatesService: ExportTemplatesService,
    @InjectRepository(WorkflowDefinition)
    @Optional()
    private readonly workflowRepository: Repository<WorkflowDefinition> | null = null,
    @Optional()
    private readonly roleActionPermissionService?: RoleActionPermissionService,
    @Optional()
    private readonly workOrderValidationService?: WorkOrderValidationService,
    @InjectRepository(Department)
    @Optional()
    private readonly departmentRepository?: Repository<Department>,
    @InjectRepository(ModuleHandler)
    @Optional()
    private readonly moduleHandlerRepository?: Repository<ModuleHandler>,
    @InjectRepository(Notification)
    @Optional()
    private readonly notificationRepository?: Repository<Notification>,
    @InjectRepository(OperationLog)
    @Optional()
    private readonly operationLogRepository?: Repository<OperationLog>,
    @InjectRepository(FieldConfig)
    @Optional()
    private readonly fieldConfigRepository?: Repository<FieldConfig>,
    @Optional()
    private readonly fieldPermissionService?: FieldPermissionService,
    @Optional()
    private readonly detailViewTemplatesService?: DetailViewTemplatesService,
  ) {}

  async create(
    dto: CreateInServiceOrderDto,
    user: JwtUserPayload,
  ): Promise<InServiceOrderResponseDto> {
    this.assertCanCreate(user);
    const orderKind = dto.orderKind ?? InServiceOrderKind.SINGLE_BUSINESS;
    if (orderKind === InServiceOrderKind.RESIGNATION_CERTIFICATE) {
      throw businessException(4814, HttpStatus.BAD_REQUEST, '离职证明必须从离职管理的离职证明子工单办理');
    }
    const businessScope = await this.resolveCreateBusinessScope(orderKind, dto.businessScope, user);
    let extraData = dto.extraData ?? {};
    let departmentId = dto.departmentId;
    if (orderKind === InServiceOrderKind.CONTRACT_RENEWAL) {
      const renewalContext = await this.resolveRenewalContext(dto);
      departmentId = renewalContext.departmentId;
      extraData = {
        ...extraData,
        renewal_source: renewalContext.source,
      };
    } else if (this.workOrderValidationService) {
      departmentId = await this.workOrderValidationService.resolveDepartmentId(undefined, user.sub);
    }
    if (!departmentId) {
      throw businessException(3000, HttpStatus.BAD_REQUEST, '部门信息缺失，无法创建单项业务');
    }
    if (orderKind === InServiceOrderKind.CERTIFICATE && dto.idCardNo) {
      const history = await this.getRenewalHistory(dto.customerId, dto.idCardNo);
      if (history.found) {
        const source = (history.extraData ?? {}) as Record<string, unknown>;
        extraData = {
          ...source,
          ...extraData,
          hireDate: extraData.hireDate ?? source.hire_date ?? source.contract_start_date,
          jobTitle: extraData.jobTitle ?? source.job_title ?? source.position,
          referenceBaseSalary: extraData.referenceBaseSalary
            ?? source.reference_base_salary
            ?? source.base_salary,
        };
      }
    }
    this.validateKindPayload(orderKind, { ...dto, extraData });
    if (orderKind === InServiceOrderKind.CONTRACT_RENEWAL) {
      await this.assertRenewalSalary(dto.customerId, dto.idCardNo, extraData);
    }

    const handlerId = await this.pickHandler(
      orderKind,
      businessScope,
      dto.province ?? null,
    );
    const now = new Date();
    const order = this.repository.create({
      ...dto,
      departmentId,
      orderKind,
      businessScope,
      employeeName: dto.employeeName?.trim() || null,
      idCardNo: dto.idCardNo?.trim() || null,
      extraData,
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
    const response = await this.saveAndRespond(order);
    await this.notifyAssigned(order, 'in_service_order_created', '在职工单已创建', `工单 ${order.orderNo} 已自动派发给你`);
    return response;
  }

  async batchCreateRenewals(
    items: CreateInServiceOrderDto[],
    user: JwtUserPayload,
  ): Promise<{ items: InServiceOrderResponseDto[]; total: number }> {
    if (items.length === 0) {
      throw new NotFoundException('至少选择一条续签记录');
    }
    if (items.some((item) => item.orderKind && item.orderKind !== InServiceOrderKind.CONTRACT_RENEWAL)) {
      throw new ForbiddenException('批量发起接口仅支持劳动合同续签');
    }
    const seenKeys = new Set<string>();
    for (const item of items) {
      const extraData = item.extraData ?? {};
      this.validateKindPayload(InServiceOrderKind.CONTRACT_RENEWAL, { ...item, extraData });
      const idCardNo = item.idCardNo?.trim().toUpperCase();
      if (idCardNo) {
        const key = `${item.customerId.trim()}:${idCardNo}`;
        if (seenKeys.has(key)) {
          throw businessException(4818, HttpStatus.CONFLICT, '同一客户和证件号码在本批次重复');
        }
        seenKeys.add(key);
      }
      await this.resolveRenewalContext(item);
      await this.assertRenewalSalary(item.customerId, item.idCardNo, extraData);
    }
    const results: InServiceOrderResponseDto[] = [];
    for (const item of items) {
      results.push(await this.create({
        ...item,
        orderKind: InServiceOrderKind.CONTRACT_RENEWAL,
      }, user));
    }
    return { items: results, total: results.length };
  }

  listOutOfProvinceAccounts(keyword?: string) {
    const normalized = keyword?.trim().toLocaleLowerCase();
    return OUT_OF_PROVINCE_ACCOUNTS.filter((account) => {
      if (!normalized) return true;
      return [account.unitName, account.province, account.city, account.socialHandler, account.businessOwner]
        .some((value) => value.toLocaleLowerCase().includes(normalized));
    });
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

    const businessScope = await this.resolveListBusinessScope(query, user);
    qb.andWhere('order.business_scope = :businessScope', { businessScope });

    if (query.onlyUnassigned) {
      if (!isAdminRole(user.roles)) {
        throw new ForbiddenException('仅管理员可查看未指派历史工单');
      }
      qb.andWhere('order.handler_id IS NULL');
      qb.andWhere('order.order_kind = :historyOrderKind', { historyOrderKind: InServiceOrderKind.CERTIFICATE });
      qb.andWhere('order.status = :historyOrderStatus', { historyOrderStatus: InServiceOrderStatus.DISPATCHED });
    }

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
    if (query.status) {
      const statuses = expandInServiceStatusFilter(query.orderKind, query.status);
      qb.andWhere('order.status IN (:...statuses)', { statuses });
    }
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
          .orWhere('creator.real_name ILIKE :keyword', { keyword: `%${query.keyword!.trim()}%` })
          .orWhere('creator.username ILIKE :keyword', { keyword: `%${query.keyword!.trim()}%` })
          .orWhere('handler.real_name ILIKE :keyword', { keyword: `%${query.keyword!.trim()}%` })
          .orWhere('handler.username ILIKE :keyword', { keyword: `%${query.keyword!.trim()}%` })
          .orWhere('order.order_kind::text ILIKE :keyword', { keyword: `%${query.keyword!.trim()}%` })
          .orWhere('order.business_type::text ILIKE :keyword', { keyword: `%${query.keyword!.trim()}%` })
          .orWhere('order.process_type::text ILIKE :keyword', { keyword: `%${query.keyword!.trim()}%` });
      }));
    }

    const isOutOfProvinceList = query.orderKind === InServiceOrderKind.OUT_OF_PROVINCE_INCREASE
      || query.orderKind === InServiceOrderKind.OUT_OF_PROVINCE_DECREASE;
    qb.addSelect(
      isOutOfProvinceList
        ? `CASE WHEN order.extra_data ? '${MATERIAL_CHANGE_REQUEST_KEY}' THEN 0 ELSE 1 END`
        : "CASE WHEN order.status = 'pending_info' THEN 0 ELSE 1 END",
      'status_priority',
    );
    qb.orderBy('status_priority', 'ASC');
    if (typeof (qb as typeof qb & { addOrderBy?: unknown }).addOrderBy === 'function') {
      qb.addOrderBy('order.updatedAt', 'DESC');
    }
    qb
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

  private async resolveRenewalContext(dto: CreateInServiceOrderDto): Promise<{
    departmentId: string;
    source: 'matched_history' | 'legacy_stock';
  }> {
    const history = await this.getRenewalHistory(dto.customerId, dto.idCardNo ?? '');
    if (history.found) {
      if (!history.departmentId) {
        throw businessException(4815, HttpStatus.BAD_REQUEST, '历史续签记录缺少发起部门，无法继续续签');
      }
      return { departmentId: history.departmentId, source: 'matched_history' };
    }
    const departmentId = dto.departmentId?.trim();
    if (!departmentId) {
      throw businessException(4815, HttpStatus.BAD_REQUEST, '系统无历史记录，发起部门不能为空');
    }
    if (this.departmentRepository) {
      const department = await this.departmentRepository.findOne({
        where: { id: departmentId, isActive: true },
      });
      if (!department) {
        throw businessException(4815, HttpStatus.BAD_REQUEST, '发起部门不存在或已停用');
      }
    }
    return { departmentId, source: 'legacy_stock' };
  }

  async getRenewalHistory(customerId: string, idCardNo: string) {
    const normalizedCustomerId = customerId?.trim();
    const normalizedIdCardNo = idCardNo?.trim();
    if (!normalizedCustomerId || !normalizedIdCardNo) {
      return {
        found: false,
        source: null,
        orderId: null,
        orderNo: null,
        employeeName: null,
        idCardNo: normalizedIdCardNo || null,
        departmentId: null,
        extraData: {},
        fixedTermCount: 0,
        fixedTermRisk: false,
        warning: null,
      };
    }

    const [onboardingOrders, renewalOrders] = await Promise.all([
      this.workOrderRepository.find({
        where: {
          customerId: normalizedCustomerId,
          employeeIdCard: normalizedIdCardNo,
          orderType: OrderType.ONBOARDING,
        },
        order: { createdAt: 'DESC' },
        take: 30,
      }),
      this.repository.find({
        where: {
          customerId: normalizedCustomerId,
          idCardNo: normalizedIdCardNo,
          orderKind: InServiceOrderKind.CONTRACT_RENEWAL,
        },
        order: { createdAt: 'DESC' },
        take: 30,
      }),
    ]);
    const history = [
      ...onboardingOrders
        .filter((order) => order.status !== WorkOrderStatus.DRAFT)
        .map((order) => ({
          source: 'onboarding' as const,
          orderId: order.id,
          orderNo: order.orderNo,
          employeeName: order.employeeName,
          idCardNo: order.employeeIdCard,
          departmentId: order.departmentId,
          extraData: order.extraData ?? {},
          createdAt: order.createdAt,
        })),
      ...renewalOrders.map((order) => ({
        source: 'renewal' as const,
        orderId: order.id,
        orderNo: order.orderNo,
        employeeName: order.employeeName,
        idCardNo: order.idCardNo,
        departmentId: order.departmentId,
        extraData: order.extraData ?? {},
        createdAt: order.createdAt,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const fixedTermCount = history.filter((item) => {
      const termType = item.extraData.contract_term_type ?? item.extraData.renewal_term_type;
      return termType && String(termType) !== '无固定期限';
    }).length;
    const latest = history[0];
    return {
      found: Boolean(latest),
      source: latest?.source ?? null,
      orderId: latest?.orderId ?? null,
      orderNo: latest?.orderNo ?? null,
      employeeName: latest?.employeeName ?? null,
      idCardNo: latest?.idCardNo ?? normalizedIdCardNo,
      departmentId: latest?.departmentId ?? null,
      extraData: latest?.extraData ?? {},
      fixedTermCount,
      fixedTermRisk: fixedTermCount >= 2,
      warning: fixedTermCount >= 2
        ? '该员工已有两次或以上固定期限合同记录，续签前请确认是否应签订无固定期限合同。'
        : null,
    };
  }

  private async assertRenewalSalary(
    customerId: string,
    idCardNo: string | undefined,
    extraData: Record<string, unknown>,
  ): Promise<void> {
    const submittedSalary = this.parseSalary(extraData.base_salary ?? extraData.renewal_base_salary);
    if (submittedSalary === null || submittedSalary <= 0) {
      throw businessException(4811, HttpStatus.BAD_REQUEST, '续签基本工资必须为大于 0 的数字');
    }
    void customerId;
    void idCardNo;
  }

  private parseSalary(value: unknown): number | null {
    if (value === undefined || value === null) return null;
    const normalized = String(value).replace(/[^0-9.-]/g, '');
    if (!normalized) return null;
    const result = Number(normalized);
    return Number.isFinite(result) ? result : null;
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
    const response = InServiceOrderResponseDto.fromEntity(order) as InServiceOrderResponseDto & {
      _detailTemplateFieldCodes?: string[];
      fields?: Array<Record<string, unknown>>;
      visibleFields?: string[];
      readonlyFields?: string[];
      _fieldPermissions?: Record<string, string>;
    };
    const moduleCode = this.getHandlerModuleCode(
      order.orderKind ?? InServiceOrderKind.SINGLE_BUSINESS,
      order.businessScope ?? BusinessScope.BEILUN,
    );
    const template = this.detailViewTemplatesService
      ? await this.detailViewTemplatesService.getActiveByModule(moduleCode, order.businessScope ?? BusinessScope.BEILUN)
      : null;
    const templateCodes = template
      ? Array.from(new Set((template.fieldList ?? []).map((item) => String(item.fieldCode ?? item.field_code ?? item.code ?? '').trim()).filter(Boolean)))
      : [];
    if (templateCodes.length > 0) response._detailTemplateFieldCodes = templateCodes;

    if (this.fieldConfigRepository && this.fieldPermissionService && user) {
      const permissions = await this.fieldPermissionService.getPermissionsForUser(
        user.sub,
        'main',
        order.businessScope ?? BusinessScope.BEILUN,
      );
      const effectivePermissions = new Map(permissions);
      if (order.orderKind === InServiceOrderKind.CERTIFICATE) {
        for (const fieldCode of CERTIFICATE_EXTRA_DATA_FIELDS) {
          if (!effectivePermissions.has(fieldCode)) {
            effectivePermissions.set(fieldCode, FieldPermissionMode.READONLY);
          }
        }
      }
      for (const fieldCode of templateCodes) {
        if (!effectivePermissions.get(fieldCode) || effectivePermissions.get(fieldCode) === FieldPermissionMode.HIDDEN) {
          effectivePermissions.set(fieldCode, FieldPermissionMode.READONLY);
        }
      }
      const fieldConfigs = await this.fieldConfigRepository.find({
        where: { isActive: true },
        order: { displayOrder: 'ASC' },
      });
      const allowedCodes = templateCodes.length > 0 ? new Set(templateCodes) : null;
      const selectedFields = allowedCodes
        ? fieldConfigs.filter((field) => allowedCodes.has(field.fieldCode))
        : fieldConfigs;
      const fieldExtraData = { ...(order.extraData ?? {}) };
      if (order.orderKind === InServiceOrderKind.CERTIFICATE) {
        const certificateFieldAliases: Record<string, string> = {
          certificate_type: 'certificateType',
          certificate_purpose: 'purpose',
          hire_date: 'hireDate',
          job_title: 'jobTitle',
          reference_base_salary: 'referenceBaseSalary',
          average_monthly_income: 'averageMonthlyIncome',
        };
        for (const [fieldCode, alias] of Object.entries(certificateFieldAliases)) {
          if (fieldExtraData[fieldCode] == null && fieldExtraData[alias] != null) {
            fieldExtraData[fieldCode] = fieldExtraData[alias];
          }
        }
      }
      const filtered = this.fieldPermissionService.buildFieldViews(
        selectedFields,
        fieldExtraData,
        effectivePermissions,
      );
      response.fields = filtered.map((field) => ({ ...field }));
      response.visibleFields = filtered.map((field) => field.fieldCode);
      response.readonlyFields = filtered.filter((field) => field.permission === FieldPermissionMode.READONLY).map((field) => field.fieldCode);
      response._fieldPermissions = Object.fromEntries(filtered.map((field) => [field.fieldCode, field.permission]));
      response.extraData = this.fieldPermissionService.applyExtraData(order.extraData ?? {}, effectivePermissions).data;
    }
    return response;
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
    await this.assertFlowTransition(order, InServiceOrderStatus.DISPATCHED);
    order.handlerId = await this.pickHandler(
      order.orderKind ?? InServiceOrderKind.SINGLE_BUSINESS,
      order.businessScope ?? BusinessScope.BEILUN,
      order.province,
    ) ?? dto.handlerId ?? null;
    order.status = InServiceOrderStatus.DISPATCHED;
    order.approvedBy = user.sub;
    order.approvedAt = new Date();
    order.dispatchedAt = order.approvedAt;
    const response = await this.saveAndRespond(order);
    await this.notifyAssigned(order, 'in_service_order_approved', '在职工单已审批派发', `工单 ${order.orderNo} 已审批并派发给你`);
    return response;
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
    const target = order.orderKind === InServiceOrderKind.CERTIFICATE
      ? InServiceOrderStatus.PROCESSING
      : InServiceOrderStatus.ACCEPTED;
    await this.assertFlowTransition(order, target);
    const acceptedAt = new Date();
    order.acceptedAt = acceptedAt;
    order.status = target;
    if (target === InServiceOrderStatus.PROCESSING) order.processingAt = acceptedAt;
    return this.saveAndRespond(order);
  }

  async confirm(id: string, user: JwtUserPayload): Promise<InServiceOrderResponseDto> {
    const order = await this.findEntity(id);
    this.assertHandlerOrManagement(order, user);
    this.assertNoPendingMaterialChange(order);
    await this.assertFlowTransition(order, InServiceOrderStatus.READY);
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
    if (usesBeilunChildOrderFlow(order.orderKind)) {
      throw businessException(4808, HttpStatus.BAD_REQUEST, '当前工单复用北仑子工单流程，不支持转派');
    }
    if (![InServiceOrderStatus.DISPATCHED, InServiceOrderStatus.ACCEPTED].includes(order.status)) {
      throw businessException(4808, HttpStatus.BAD_REQUEST, '仅待受理或已受理工单可转派');
    }
    const handlerModuleCode = this.getHandlerModuleCode(order.orderKind, order.businessScope ?? BusinessScope.BEILUN);
    if (this.moduleHandlerRepository) {
      const configured = await this.moduleHandlerRepository.findOne({
        where: {
          moduleCode: handlerModuleCode,
          businessScope: order.businessScope ?? BusinessScope.BEILUN,
          handlerId: dto.handlerId,
          isActive: true,
        },
        relations: { handler: true },
      });
      if (!configured || configured.handler?.isActive === false) {
        throw businessException(4808, HttpStatus.BAD_REQUEST, '转派失败：目标人员不是该业务的启用负责人');
      }
    }
    const fromHandlerId = order.handlerId;
    const previousStatus = order.status;
    const transferredAt = new Date().toISOString();
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
        transferredAt,
      },
    ];
    const response = await this.saveAndRespond(order);
    await this.recordTransferAudit(order, fromHandlerId, previousStatus, user.sub, dto.reason, handlerModuleCode);
    return response;
  }

  async startProcessing(
    id: string,
    dto: StartInServiceProcessingDto,
    user: JwtUserPayload,
  ): Promise<InServiceOrderResponseDto> {
    const order = await this.findEntity(id);
    this.assertHandlerOrManagement(order, user);
    await this.assertFlowTransition(order, InServiceOrderStatus.PROCESSING);
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
    const allowedReturnStatuses = usesBeilunChildOrderFlow(order.orderKind)
      ? [
          InServiceOrderStatus.DISPATCHED,
          InServiceOrderStatus.ACCEPTED,
          InServiceOrderStatus.READY,
          InServiceOrderStatus.PROCESSING,
        ]
      : [InServiceOrderStatus.ACCEPTED, InServiceOrderStatus.PROCESSING];
    if (!allowedReturnStatuses.includes(order.status)) {
      throw businessException(4809, HttpStatus.BAD_REQUEST, '当前节点不可退回');
    }
    const returnStatus = order.status;
    await this.assertFlowTransition(order, InServiceOrderStatus.PENDING_INFO);
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

    const resubmitReason = dto.resubmitReason?.trim();
    if (!resubmitReason) {
      throw businessException(4810, HttpStatus.BAD_REQUEST, '重新提交原因不能为空');
    }
    const { resubmitReason: _resubmitReason, ...changes } = dto;
    const next = { ...order, ...changes };
    this.validateKindPayload(
      order.orderKind ?? InServiceOrderKind.SINGLE_BUSINESS,
      next,
    );
    if (changes.attachments) {
      const attachments = Array.from(new Set([...(order.attachments ?? []), ...changes.attachments]));
      if (attachments.length > 5) {
        throw businessException(4805, HttpStatus.BAD_REQUEST, '附件总数不能超过 5 个');
      }
      Object.assign(order, changes, { attachments });
    } else {
      Object.assign(order, changes);
    }

    const history = Array.isArray(order.extraData?.__resubmitHistory)
      ? order.extraData.__resubmitHistory
      : [];
    order.extraData = {
      ...(order.extraData ?? {}),
      __resubmitHistory: [...history, {
        reason: resubmitReason,
        submittedBy: user.sub,
        submittedAt: new Date().toISOString(),
      }].slice(-20),
    };
    const target = order.pendingReturnStatus ?? InServiceOrderStatus.DISPATCHED;
    await this.assertFlowTransition(order, target);
    order.status = target;
    order.pendingReturnStatus = null;
    order.pendingInfoReason = null;
    const response = await this.saveAndRespond(order);
    await this.notifyAssigned(order, 'in_service_order_resubmitted', '在职工单已重新提交', `工单 ${order.orderNo} 已补充材料并重新提交`);
    return response;
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
    if (
      order.orderKind === InServiceOrderKind.CERTIFICATE
      && String(order.extraData?.certificateType ?? '') === 'income'
    ) {
      const averageMonthlyIncome = this.parseSalary(dto.extraData?.averageMonthlyIncome);
      if (averageMonthlyIncome === null || averageMonthlyIncome <= 0) {
        throw businessException(4811, HttpStatus.BAD_REQUEST, '经办人完成收入证明前必须填写近一年税前月均收入');
      }
      order.extraData = {
        ...(order.extraData ?? {}),
        averageMonthlyIncome,
        incomeConfirmedBy: user.sub,
        incomeConfirmedAt: new Date().toISOString(),
      };
    }

    const provinceFeedback = this.normalizeOutOfProvinceCompletionFeedback(order, dto.extraData ?? {});
    if (provinceFeedback) {
      order.extraData = { ...(order.extraData ?? {}), ...provinceFeedback.patch };
      order.completionRemark = dto.remark?.trim() || null;
      order.attachments = this.mergeAttachments(order.attachments, dto.attachments);
      if (!provinceFeedback.complete) {
        order.completedAt = null;
        return this.saveAndRespond(order);
      }
    }

    await this.assertFlowTransition(order, InServiceOrderStatus.COMPLETED);
    order.status = InServiceOrderStatus.COMPLETED;
    order.completionRemark = dto.remark?.trim() || null;
    order.attachments = this.mergeAttachments(order.attachments, dto.attachments);
    order.completedAt = new Date();
    const response = await this.saveAndRespond(order);
    await this.writeBackResignationCertificateResult(order);
    return response;
  }

  private async writeBackResignationCertificateResult(order: InServiceOrder): Promise<void> {
    if (order.orderKind !== InServiceOrderKind.RESIGNATION_CERTIFICATE) return;
    const sourceId = order.extraData?.source_work_order_id;
    if (typeof sourceId !== 'string' || !sourceId.trim()) return;
    const source = await this.workOrderRepository.findOne({ where: { id: sourceId } });
    if (!source) return;
    const sourceExtraData = source.extraData ?? {};
    const oldAttachments = Array.isArray(sourceExtraData.resignation_cert_attachments)
      ? sourceExtraData.resignation_cert_attachments.filter((value): value is string => typeof value === 'string')
      : [];
    source.extraData = {
      ...sourceExtraData,
      resignation_cert_status: '已开具',
      resignation_cert_result: order.completionRemark,
      resignation_cert_attachments: Array.from(new Set([...oldAttachments, ...(order.attachments ?? [])])),
      resignation_cert_completed_at: (order.completedAt ?? new Date()).toISOString(),
    };
    await this.workOrderRepository.save(source);
  }

  async fail(
    id: string,
    dto: CompleteInServiceOrderDto,
    user: JwtUserPayload,
  ): Promise<InServiceOrderResponseDto> {
    const order = await this.findEntity(id);
    this.assertHandlerOrManagement(order, user);
    this.assertNoPendingMaterialChange(order);
    await this.assertFlowTransition(order, InServiceOrderStatus.FAILED);
    order.status = InServiceOrderStatus.FAILED;
    order.completionRemark = dto.remark?.trim() || null;
    order.attachments = this.mergeAttachments(order.attachments, dto.attachments);
    order.completedAt = new Date();
    return this.saveAndRespond(order);
  }

  async cancel(
    id: string,
    dto: CancelInServiceOrderDto,
    user: JwtUserPayload,
  ): Promise<InServiceOrderResponseDto> {
    const order = await this.findEntity(id);
    this.assertCreator(order, user);
    return this.cancelOrder(order, dto.reason, user, dto.action ?? InServiceCancelAction.VOID);
  }

  async exportRenewalTemplate(id: string, user: JwtUserPayload) {
    const order = await this.findEntity(id);
    this.assertHandlerOrManagement(order, user);
    return this.exportTemplatesService.exportContractRenewal(order, user);
  }

  async exportOutOfProvinceBatch(
    ids: string[],
    user: JwtUserPayload,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const uniqueIds = Array.from(new Set(ids));
    const orders = await Promise.all(uniqueIds.map((id) => this.findEntity(id)));
    orders.forEach((order) => this.assertCanView(order, user));
    if (orders.some((order) => ![
      InServiceOrderKind.OUT_OF_PROVINCE_INCREASE,
      InServiceOrderKind.OUT_OF_PROVINCE_DECREASE,
    ].includes(order.orderKind))) {
      throw businessException(4812, HttpStatus.BAD_REQUEST, '仅省外增员或减员工单可导出');
    }
    return createOutOfProvinceExportWorkbook(orders);
  }

  async exportOutOfProvince(
    id: string,
    user: JwtUserPayload,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const order = await this.findEntity(id);
    this.assertCanView(order, user);
    if (![
      InServiceOrderKind.OUT_OF_PROVINCE_INCREASE,
      InServiceOrderKind.OUT_OF_PROVINCE_DECREASE,
    ].includes(order.orderKind)) {
      throw businessException(4812, HttpStatus.BAD_REQUEST, '仅省外增员或减员工单可导出');
    }
    return createOutOfProvinceExportWorkbook(order);
  }

  async generateCertificate(
    id: string,
    user: JwtUserPayload,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const order = await this.findEntity(id);
    this.assertHandlerOrManagement(order, user);

    if (order.orderKind === InServiceOrderKind.RESIGNATION_CERTIFICATE) {
      return this.generateResignationCertificate(order);
    }
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

    return this.renderCertificateTemplate(
      templateName,
      {
        employeeName: order.employeeName,
        idCardNo: order.idCardNo,
        hireDate: order.extraData?.hireDate,
        jobTitle: order.extraData?.jobTitle,
        purpose: order.extraData?.purpose,
        averageMonthlyIncome: order.extraData?.averageMonthlyIncome,
      },
      `${certificateType}-${order.orderNo}.docx`,
    );
  }

  private async generateResignationCertificate(
    order: InServiceOrder,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const extraData = order.extraData ?? {};
    const history = await this.getRenewalHistory(order.customerId, order.idCardNo ?? '');
    const historyData: Record<string, unknown> = history.extraData ?? {};
    const idCardNo = this.firstText(order.idCardNo, history.idCardNo);
    const reason = this.firstText(
      extraData.resignationReason,
      extraData.resignation_reason,
      historyData.resignation_reason,
    );
    const reasonCode = this.firstText(
      extraData.resignationReasonCode,
      extraData.resignation_reason_code,
    ) || this.resolveResignationReasonCode(reason);
    const legalArticle = this.firstText(
      extraData.legalArticle,
      extraData.legal_article,
    ) || this.extractLegalArticle(reason);

    return this.renderCertificateTemplate(
      'resignation-certificate.docx',
      {
        employeeName: this.firstText(order.employeeName, history.employeeName),
        gender: this.firstText(extraData.gender, historyData.gender) || this.deriveGender(idCardNo),
        idCardNo,
        jobTitle: this.firstText(
          extraData.jobTitle,
          extraData.job_title,
          historyData.jobTitle,
          historyData.job_title,
          historyData.position,
          historyData.renewal_position,
        ),
        contractTermText: buildContractTermText({ ...historyData, ...extraData }),
        resignationReasonCode: reasonCode,
        resignationDate: this.firstText(
          extraData.resignationDate,
          extraData.resignation_date,
        ),
        otherReason: reasonCode === '4' ? reason : '',
        legalArticleText: legalArticle ? `第${legalArticle}条` : '相关规定',
      },
      `resignation-certificate-${order.orderNo}.docx`,
    );
  }

  private async renderCertificateTemplate(
    templateName: string,
    replacements: Record<string, unknown>,
    fileName: string,
  ): Promise<{ buffer: Buffer; fileName: string }> {
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
    for (const [key, rawValue] of Object.entries(replacements)) {
      const token = `{{${key}}}`;
      const value = this.escapeXml(rawValue == null ? '' : String(rawValue));
      xml = xml.split(token).join(value);
    }
    zip.file('word/document.xml', xml);

    return {
      buffer: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
      fileName,
    };
  }

  private firstText(...values: unknown[]): string {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      const text = String(value).trim();
      if (text) return text;
    }
    return '';
  }

  private deriveGender(idCardNo: string): string {
    const digit = idCardNo.length === 18
      ? idCardNo[16]
      : idCardNo.length === 15
        ? idCardNo[14]
        : '';
    if (!digit || !/\d/.test(digit)) return '';
    return Number(digit) % 2 === 1 ? '男' : '女';
  }

  private resolveResignationReasonCode(reason: string): string {
    if (/合同期满|期满终止|合同到期/.test(reason)) return '1';
    if (/辞职|个人原因|员工提出|劳动者提出/.test(reason)) return '2';
    if (/协商一致|双方协商/.test(reason)) return '3';
    return '4';
  }

  private extractLegalArticle(reason: string): string {
    return reason.match(/第\s*(\d+)\s*条/)?.[1] ?? '';
  }

  async close(
    id: string,
    dto: CloseInServiceOrderDto,
    user: JwtUserPayload,
  ): Promise<InServiceOrderResponseDto> {
    const order = await this.findEntity(id);
    this.assertOwnerOrManagement(order, user);
    await this.assertFlowTransition(order, InServiceOrderStatus.ARCHIVED);
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
    action?: InServiceCancelAction,
  ): Promise<InServiceOrderResponseDto> {
    await this.assertFlowTransition(order, InServiceOrderStatus.CANCELLED);
    order.status = InServiceOrderStatus.CANCELLED;
    order.closedBy = user.sub;
    order.closedAt = new Date();
    order.closeReason = reason.trim();
    if (action) {
      // ponytail: withdrawal and void share the existing cancelled terminal state until restoration rules diverge.
      order.extraData = {
        ...(order.extraData ?? {}),
        __closureAction: action,
        __closureAt: order.closedAt.toISOString(),
      };
    }
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

  private normalizeOutOfProvinceCompletionFeedback(
    order: InServiceOrder,
    input: Record<string, unknown>,
  ): { patch: Record<string, unknown>; complete: boolean } | null {
    if (
      order.orderKind !== InServiceOrderKind.OUT_OF_PROVINCE_INCREASE
      && order.orderKind !== InServiceOrderKind.OUT_OF_PROVINCE_DECREASE
    ) return null;

    const source = { ...(order.extraData ?? {}), ...input };
    const aliases: Record<string, readonly string[]> = {
      social_insurance_result: ['social_insurance_result', 'socialInsuranceResult', '社保是否办结'],
      medical_insurance_result: ['medical_insurance_result', 'medicalInsuranceResult', '医保是否办结'],
      housing_fund_result: ['housing_fund_result', 'housingFundResult', '公积金是否办结'],
    };
    const patch: Record<string, unknown> = {};
    let complete = true;
    for (const [fieldCode, fieldAliases] of Object.entries(aliases)) {
      const raw = fieldAliases
        .map((alias) => source[alias])
        .find((value) => value !== undefined && value !== null && String(value).trim() !== '');
      const normalized = normalizeHandlingResult(raw);
      if (raw !== undefined && !normalized) {
        throw businessException(4811, HttpStatus.BAD_REQUEST, '社保、医保和公积金办结结果仅允许填写是或否');
      }
      if (normalized) patch[fieldCode] = normalized;
      if (normalized !== HANDLING_RESULT_COMPLETED) complete = false;
    }

    const remark = [
      source.social_insurance_remark,
      source.socialInsuranceRemark,
      source['社保公积金办理备注'],
    ].find((value) => value !== undefined && value !== null && String(value).trim() !== '');
    if (remark !== undefined) patch.social_insurance_remark = String(remark).trim();
    return { patch, complete };
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
      const contractTerm = extraData.contract_term
        ?? extraData.renewal_term
        ?? extraData.contractTerm;
      const contractTermType = String(
        extraData.contract_term_type ?? extraData.renewal_term_type ?? '',
      );
      const baseSalary = extraData.base_salary ?? extraData.renewal_base_salary;
      if (baseSalary === undefined || baseSalary === null || String(baseSalary).trim() === '') {
        throw businessException(4811, HttpStatus.BAD_REQUEST, '续签基本工资不能为空');
      }
      const fixedTermFieldsMissing = contractTermType !== '无固定期限'
        && (!contractTerm || String(contractTerm).trim() === '' || !contractEndDate);
      if (!contractStartDate || fixedTermFieldsMissing) {
        throw businessException(
          4811,
          HttpStatus.BAD_REQUEST,
          contractTermType === '无固定期限'
            ? '合同开始日期不能为空'
            : '合同开始日期、合同期限和结束日期不能为空',
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
      return;
    }

    if (orderKind === InServiceOrderKind.RESIGNATION_CERTIFICATE) {
      if (!extraData.resignationDate) {
        throw businessException(4811, HttpStatus.BAD_REQUEST, '离职日期不能为空');
      }
      return;
    }

    const insuredUnit = extraData.contract_subject
      ?? extraData.contractSubject
      ?? extraData.insured_unit
      ?? extraData.insuredUnit
      ?? extraData['参保单位']
      ?? extraData.payment_institution
      ?? extraData.paymentInstitution;
    const socialPayRegion = extraData.social_pay_region
      ?? extraData.socialPayRegion
      ?? [payload.province, payload.city].filter(Boolean).join('/');
    if (
      !payload.province
      || !PROVINCE_SET.has(payload.province)
      || !payload.city?.trim()
      || !insuredUnit
      || !socialPayRegion
    ) {
      throw businessException(4811, HttpStatus.BAD_REQUEST, '参保单位和缴纳地不能为空');
    }
    const hasValue = (value: unknown) => (
      value !== undefined
      && value !== null
      && (typeof value !== 'string' || value.trim().length > 0)
    );
    if (orderKind === InServiceOrderKind.OUT_OF_PROVINCE_INCREASE) {
      const requiredIncreaseValues = [
        extraData.start_month ?? extraData.startMonth ?? extraData.social_start_month ?? extraData.socialStartMonth,
        extraData.social_base ?? extraData.socialBase ?? extraData.social_security_base ?? extraData.socialSecurityBase,
        extraData.fund_start_month ?? extraData.fundStartMonth,
        extraData.fund_base ?? extraData.fundBase ?? extraData.housing_fund_base ?? extraData.housingFundBase,
      ];
      if (requiredIncreaseValues.some((value) => !hasValue(value))) {
        throw businessException(4811, HttpStatus.BAD_REQUEST, '省外增员需填写社保、公积金起缴月和缴费工资');
      }
    }
    if (orderKind === InServiceOrderKind.OUT_OF_PROVINCE_DECREASE) {
      const requiredDecreaseValues = [
        extraData.social_stop_month ?? extraData.socialStopMonth,
        extraData.fund_stop_month ?? extraData.fundStopMonth,
        extraData.last_work_date ?? extraData.lastWorkDate,
      ];
      if (requiredDecreaseValues.some((value) => !hasValue(value))) {
        throw businessException(4811, HttpStatus.BAD_REQUEST, '省外减员需填写社保停缴月、公积金停缴月和最后工作日');
      }
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

  private async resolveCreateBusinessScope(
    orderKind: InServiceOrderKind,
    requestedScope: BusinessScope | undefined,
    user: JwtUserPayload,
  ): Promise<BusinessScope> {
    if ([
      InServiceOrderKind.OUT_OF_PROVINCE_INCREASE,
      InServiceOrderKind.OUT_OF_PROVINCE_DECREASE,
    ].includes(orderKind)) {
      await this.assertBusinessScopeAccess(user, BusinessScope.OUT_OF_PROVINCE);
      return BusinessScope.OUT_OF_PROVINCE;
    }
    if ([
      InServiceOrderKind.CONTRACT_RENEWAL,
      InServiceOrderKind.CERTIFICATE,
      InServiceOrderKind.RESIGNATION_CERTIFICATE,
    ].includes(orderKind)) {
      return BusinessScope.BEILUN;
    }
    const accountScope = user.businessScope ?? BusinessScope.BEILUN;
    const scope = requestedScope ?? accountScope;
    if (user.roles.some((role) => BUSINESS_FRONT_ROLE_CODES.has(role)) && scope === accountScope) {
      return accountScope;
    }
    await this.assertBusinessScopeAccess(user, scope);
    return scope;
  }

  private async resolveListBusinessScope(
    query: ListInServiceOrderQueryDto,
    user: JwtUserPayload,
  ): Promise<BusinessScope> {
    const accountScope = user.businessScope ?? BusinessScope.BEILUN;
    const scope = query.businessScope ?? query.business_scope ?? accountScope;
    if (user.roles.some((role) => BUSINESS_FRONT_ROLE_CODES.has(role)) && scope === accountScope) {
      return accountScope;
    }
    await this.assertBusinessScopeAccess(user, scope);
    return scope;
  }

  private async assertBusinessScopeAccess(user: JwtUserPayload, businessScope: BusinessScope): Promise<void> {
    if (isAdminRole(user.roles) || !user.businessScope || user.businessScope === businessScope) return;
    const allowed = this.roleActionPermissionService
      ? await this.roleActionPermissionService.hasAnyRoleAction(user.roles, 'business_scope.switch', businessScope)
      : false;
    if (!allowed) throw businessException(5000, HttpStatus.FORBIDDEN, '无权切换业务范围');
  }

  private getHandlerModuleCode(orderKind: InServiceOrderKind, businessScope: BusinessScope): DispatchModuleCode {
    if (
      orderKind === InServiceOrderKind.SINGLE_BUSINESS
      || orderKind === InServiceOrderKind.OUT_OF_PROVINCE_INCREASE
      || orderKind === InServiceOrderKind.OUT_OF_PROVINCE_DECREASE
    ) {
      return businessScope === BusinessScope.OUT_OF_PROVINCE
        ? DispatchModuleCode.OUT_OF_PROVINCE_DISPATCH
        : DispatchModuleCode.IN_SERVICE_SINGLE_BUSINESS;
    }
    return orderKind === InServiceOrderKind.CONTRACT_RENEWAL
      ? DispatchModuleCode.RENEWAL_CONTRACT
      : orderKind === InServiceOrderKind.CERTIFICATE
        ? DispatchModuleCode.IN_SERVICE_CERTIFICATE
        : DispatchModuleCode.RESIGNATION_CERT;
  }

  private async notifyAssigned(
    order: InServiceOrder,
    bizType: string,
    title: string,
    content: string,
  ): Promise<void> {
    if (!this.notificationRepository || !order.handlerId) return;
    const detailPath = order.orderKind === InServiceOrderKind.CERTIFICATE
      ? `/in-service/certificates/${order.id}`
      : order.orderKind === InServiceOrderKind.CONTRACT_RENEWAL
        ? `/renewal/${order.id}`
        : `/in-service/${order.id}`;
    try {
      await this.notificationRepository.save(this.notificationRepository.create({
        userId: order.handlerId,
        bizType,
        title,
        content,
        link: detailPath,
        payload: { inServiceOrderId: order.id, orderNo: order.orderNo },
        isRead: false,
        readAt: null,
      }));
    } catch {
      // ponytail: notification persistence is secondary to a successful order transition.
    }
  }

  private async recordTransferAudit(
    order: InServiceOrder,
    previousHandlerId: string | null,
    previousStatus: InServiceOrderStatus,
    operatorId: string,
    reason: string | undefined,
    handlerModuleCode: DispatchModuleCode,
  ): Promise<void> {
    const normalizedReason = reason?.trim() || null;
    if (this.operationLogRepository) {
      await this.operationLogRepository.save(this.operationLogRepository.create({
        entityType: 'in_service_order',
        entityId: order.id,
        userId: operatorId,
        actionType: 'reassign',
        beforeData: { handlerId: previousHandlerId, status: previousStatus },
        afterData: {
          handlerId: order.handlerId,
          status: order.status,
          moduleCode: handlerModuleCode,
          reason: normalizedReason,
        },
        ipAddress: null,
      }));
    }
    if (this.notificationRepository && order.handlerId) {
      const detailPath = order.orderKind === InServiceOrderKind.CERTIFICATE
        ? `/in-service/certificates/${order.id}`
        : order.orderKind === InServiceOrderKind.CONTRACT_RENEWAL
          ? `/renewal/${order.id}`
          : `/in-service/${order.id}`;
      await this.notificationRepository.save(this.notificationRepository.create({
        userId: order.handlerId,
        bizType: 'in_service_order_reassign',
        title: '在职工单已派发',
        content: normalizedReason || `工单 ${order.orderNo} 已由管理员派发给你`,
        link: detailPath,
        payload: {
          inServiceOrderId: order.id,
          orderNo: order.orderNo,
          moduleCode: handlerModuleCode,
          previousHandlerId,
          operatorId,
        },
        isRead: false,
        readAt: null,
      }));
    }
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
        businessScope,
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

  private async assertFlowTransition(order: InServiceOrder, next: InServiceOrderStatus): Promise<void> {
    const orderKind = order.orderKind ?? InServiceOrderKind.SINGLE_BUSINESS;
    const flowKey = getInServiceFlowKey(orderKind);
    const isProvinceSocialOrder = orderKind === InServiceOrderKind.OUT_OF_PROVINCE_INCREASE
      || orderKind === InServiceOrderKind.OUT_OF_PROVINCE_DECREASE;
    if (!flowKey && !isProvinceSocialOrder) {
      assertInServiceOrderTransition(order.status, next);
      return;
    }

    let transitions = getDefaultInServiceOrderTransitions(orderKind);
    if (flowKey && this.workflowRepository) {
      const workflow = await this.workflowRepository.findOne({
        where: {
          flowKey,
          businessScope: order.businessScope ?? BusinessScope.BEILUN,
          status: WorkflowDefinitionStatus.PUBLISHED,
        },
        order: { updatedAt: 'DESC' },
      });
      const published = workflow?.publishedDefinitionJson?.status_transitions;
      if (published && typeof published === 'object' && !Array.isArray(published)) {
        const publishedRecord = published as Record<string, unknown>;
        const staysWithinBusinessFlow = Object.entries(publishedRecord).every(([status, candidates]) => {
          const ceiling = transitions[status as InServiceOrderStatus];
          return Array.isArray(candidates)
            && Boolean(ceiling)
            && candidates.every((candidate) => (
              typeof candidate === 'string'
              && ceiling.includes(candidate as InServiceOrderStatus)
            ));
        });
        if (staysWithinBusinessFlow) transitions = published as typeof transitions;
      }
    }

    const allowed = transitions[order.status];
    if (!allowed?.includes(next)) {
      throw businessException(
        4801,
        HttpStatus.BAD_REQUEST,
        `流程 ${flowKey ?? orderKind} 不允许状态 ${order.status} -> ${next}`,
      );
    }
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
