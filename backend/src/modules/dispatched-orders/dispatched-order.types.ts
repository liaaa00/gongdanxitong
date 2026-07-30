import { BusinessScope, DispatchedOrderStatus, WorkOrderFieldSyncBatchStatus, WorkOrderFieldSyncItemStatus } from 'src/entities';
import { FieldViewItem } from 'src/modules/field-permissions/field-permission.service';

export interface PagedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DispatchedOrderTimelineChange {
  fieldCode: string;
  fieldLabel: string;
  oldValue: unknown | null;
  newValue: unknown | null;
}

export interface DispatchedOrderTimelineItem {
  id: string;
  createdAt: Date;
  operatorId: string | null;
  operatorName: string;
  actionType: string;
  actionLabel: string;
  description: string;
  reason: string | null;
  changes: DispatchedOrderTimelineChange[];
}

export interface FieldSyncItemView {
  id: string;
  batchId: string;
  batch_id?: string;
  dispatchedOrderId: string;
  dispatched_order_id?: string;
  moduleCode: string;
  module_code?: string;
  fieldCode: string;
  field_code?: string;
  fieldLabel?: string | null;
  field_label?: string | null;
  oldValue: unknown | null;
  old_value?: unknown | null;
  newValue: unknown | null;
  new_value?: unknown | null;
  status: WorkOrderFieldSyncItemStatus;
  requiresApproval: boolean;
  requires_approval?: boolean;
  approvedBy?: string | null;
  approved_by?: string | null;
  approvedAt?: Date | null;
  approved_at?: Date | null;
  comment?: string | null;
  createdAt: Date;
  created_at?: Date;
  updatedAt: Date;
  updated_at?: Date;
}

export interface FieldSyncBatchView {
  id: string;
  workOrderId: string;
  work_order_id?: string;
  sourceDispatchedOrderId: string;
  source_dispatched_order_id?: string;
  sourceModuleCode: string;
  source_module_code?: string;
  trigger: string;
  status: WorkOrderFieldSyncBatchStatus;
  changedFields: string[];
  changed_fields?: string[];
  requestedBy?: string | null;
  requested_by?: string | null;
  reason?: string | null;
  createdAt: Date;
  created_at?: Date;
  updatedAt: Date;
  updated_at?: Date;
  items: FieldSyncItemView[];
}

export interface FieldSyncSummary {
  latestBatch: FieldSyncBatchView | null;
  latest_batch?: FieldSyncBatchView | null;
  synced: FieldSyncItemView[];
  approvalPending: FieldSyncItemView[];
  approval_pending?: FieldSyncItemView[];
  rejected: FieldSyncItemView[];
  keptOld: FieldSyncItemView[];
  kept_old?: FieldSyncItemView[];
}

export interface DispatchedOrderListItem {
  id: string;
  parentOrderId: string;
  parent_order_id?: string;
  orderNo: string;
  order_no?: string;
  moduleCode: string;
  module_code?: string;
  status: DispatchedOrderStatus;
  handlerId: string | null;
  handler_id?: string | null;
  handlerName?: string | null;
  handler_name?: string | null;
  creatorId?: string | null;
  creator_id?: string | null;
  createdBy?: string | null;
  created_by?: string | null;
  creatorName?: string | null;
  creator_name?: string | null;
  createdByName?: string | null;
  created_by_name?: string | null;
  employeeName: string;
  employee_name?: string;
  employeeIdCard?: string;
  employee_id_card?: string;
  customerId: string;
  customer_id?: string;
  customerCode?: string | null;
  customer_code?: string | null;
  customerName?: string | null;
  customer_name?: string | null;
  orderType?: string;
  order_type?: string;
  businessScope?: BusinessScope;
  business_scope?: BusinessScope;
  returnReason: string | null;
  return_reason?: string | null;
  flowRound?: number;
  flow_round?: number;
  completionRemark?: string | null;
  completion_remark?: string | null;
  dispatchedAt: Date | null;
  dispatched_at?: Date | null;
  dueAt?: Date | null;
  due_at?: Date | null;
  slaHours?: number | null;
  sla_hours?: number | null;
  slaReminderBeforeHours?: number | null;
  sla_reminder_before_hours?: number | null;
  acceptedAt: Date | null;
  accepted_at?: Date | null;
  completedAt: Date | null;
  completed_at?: Date | null;
  voidAt?: Date | null;
  void_at?: Date | null;
  createdAt: Date;
  created_at?: Date;
  updatedAt: Date;
  updated_at?: Date;
  dirtyCount?: number;
  dirty_count?: number;
  configuredHandlerNames?: string[];
  configured_handler_names?: string[];
  extraData?: Record<string, any>;
  extra_data?: Record<string, any>;
}

export interface DispatchedOrderDetailItem extends DispatchedOrderListItem {
  handlerName: string | null;
  handler_name?: string | null;
  parentOrder: {
    id: string;
    orderNo: string;
    orderType: string;
    businessScope: BusinessScope;
    status: string;
    createdBy: string;
    updatedAt: Date;
  };
  extraData: Record<string, unknown>;
  extra_data?: Record<string, unknown>;
  pendingModify?: {
    fields: Record<string, unknown>;
    reason?: string | null;
    requestedBy?: string | null;
    requestedAt?: Date | null;
    previousStatus?: DispatchedOrderStatus | null;
  } | null;
  pending_modify?: DispatchedOrderDetailItem['pendingModify'];
  syncSummary?: FieldSyncSummary;
  sync_summary?: FieldSyncSummary;
  readonlyFields?: string[];
  fields: Array<FieldViewItem & { dirty?: boolean; dirtyInfo?: unknown; dirty_info?: unknown }>;
  visibleFields: string[] | null;
  clearedDirtyCount?: number;
  cleared_dirty_count?: number;
}

export interface DispatchedOrderExportFile {
  fileId: string;
  fileName: string;
  downloadUrl: string;
  moduleCode: string;
  signPlatform: string | null;
  count: number;
}

export interface DispatchedOrderExportResult {
  templateId: string | null;
  templateName: string;
  moduleCode: string;
  columns: Array<{ fieldCode: string; title: string; order: number }>;
  rows: Array<Record<string, unknown>>;
  fileId?: string;
  fileName?: string;
  downloadUrl?: string;
  rowCount?: number;
  files?: DispatchedOrderExportFile[];
}
