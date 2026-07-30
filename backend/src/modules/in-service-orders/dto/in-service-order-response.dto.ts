import {
  BusinessScope,
  BusinessType,
  InServiceHandleChannel,
  InServiceOrder,
  InServiceOrderKind,
  InServiceOrderStatus,
  InServiceTransferRecord,
  OrderType,
  ProcessType,
  RequirementType,
} from 'src/entities';

export class InServiceOrderResponseDto {
  id!: string;
  orderNo!: string;
  orderType!: OrderType;
  orderKind!: InServiceOrderKind;
  businessScope!: BusinessScope;
  employeeName!: string | null;
  idCardNo!: string | null;
  extraData!: Record<string, unknown>;
  customerId!: string;
  customerName!: string | null;
  customerCode!: string | null;
  departmentId!: string;
  departmentName!: string | null;
  expectedCompletionDate!: string | null;
  businessReason!: string | null;
  businessType!: BusinessType | null;
  processType!: ProcessType | null;
  requirementType!: RequirementType | null;
  province!: string | null;
  city!: string | null;
  district!: string | null;
  contactPhone!: string | null;
  businessDescription!: string | null;
  serviceFee!: number | null;
  handleChannel!: InServiceHandleChannel;
  attachments!: string[];
  status!: InServiceOrderStatus;
  pendingReturnStatus!: InServiceOrderStatus | null;
  transferHistory!: InServiceTransferRecord[];
  handlerId!: string | null;
  handlerName!: string | null;
  createdBy!: string;
  createdByName!: string | null;
  approvedBy!: string | null;
  rejectedBy!: string | null;
  closedBy!: string | null;
  rejectionReason!: string | null;
  pendingInfoReason!: string | null;
  completionRemark!: string | null;
  closeReason!: string | null;
  approvedAt!: Date | null;
  rejectedAt!: Date | null;
  dispatchedAt!: Date | null;
  acceptedAt!: Date | null;
  confirmedAt!: Date | null;
  processingAt!: Date | null;
  pendingInfoAt!: Date | null;
  completedAt!: Date | null;
  closedAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
  version!: number;

  static fromEntity(order: InServiceOrder): InServiceOrderResponseDto {
    return Object.assign(new InServiceOrderResponseDto(), {
      id: order.id,
      orderNo: order.orderNo,
      orderType: order.orderType,
      orderKind: order.orderKind,
      businessScope: order.businessScope,
      employeeName: order.employeeName,
      idCardNo: order.idCardNo,
      extraData: { ...(order.extraData ?? {}) },
      customerId: order.customerId,
      customerName: order.customer?.customerName ?? null,
      customerCode: order.customer?.customerCode ?? null,
      departmentId: order.departmentId,
      departmentName: order.department?.name ?? null,
      expectedCompletionDate: order.expectedCompletionDate,
      businessReason: order.businessReason,
      businessType: order.businessType,
      processType: order.processType,
      requirementType: order.requirementType,
      province: order.province,
      city: order.city,
      district: order.district,
      contactPhone: order.contactPhone,
      businessDescription: order.businessDescription,
      serviceFee: order.serviceFee === null ? null : Number(order.serviceFee),
      handleChannel: order.handleChannel,
      attachments: [...(order.attachments ?? [])],
      status: order.status,
      pendingReturnStatus: order.pendingReturnStatus,
      transferHistory: [...(order.transferHistory ?? [])],
      handlerId: order.handlerId,
      handlerName: order.handler?.realName ?? null,
      createdBy: order.createdBy,
      createdByName: order.creator?.realName ?? null,
      approvedBy: order.approvedBy,
      rejectedBy: order.rejectedBy,
      closedBy: order.closedBy,
      rejectionReason: order.rejectionReason,
      pendingInfoReason: order.pendingInfoReason,
      completionRemark: order.completionRemark,
      closeReason: order.closeReason,
      approvedAt: order.approvedAt,
      rejectedAt: order.rejectedAt,
      dispatchedAt: order.dispatchedAt,
      acceptedAt: order.acceptedAt,
      confirmedAt: order.confirmedAt,
      processingAt: order.processingAt,
      pendingInfoAt: order.pendingInfoAt,
      completedAt: order.completedAt,
      closedAt: order.closedAt,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      version: order.version,
    });
  }
}

export class InServiceOrderListResponseDto {
  items!: InServiceOrderResponseDto[];
  total!: number;
  page!: number;
  pageSize!: number;
}
