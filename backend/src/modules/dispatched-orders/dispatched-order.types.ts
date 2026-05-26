import { DispatchedOrderStatus } from 'src/entities';
import { FieldViewItem } from 'src/modules/field-permissions/field-permission.service';

export interface PagedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
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
  priority?: 'urgent' | 'normal';
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
}

export interface DispatchedOrderDetailItem extends DispatchedOrderListItem {
  handlerName: string | null;
  handler_name?: string | null;
  parentOrder: {
    id: string;
    orderNo: string;
    orderType: string;
    status: string;
    createdBy: string;
    updatedAt: Date;
  };
  extraData: Record<string, unknown>;
  extra_data?: Record<string, unknown>;
  readonlyFields?: string[];
  fields: Array<FieldViewItem & { dirty?: boolean; dirtyInfo?: unknown; dirty_info?: unknown }>;
  visibleFields: string[] | null;
  clearedDirtyCount?: number;
  cleared_dirty_count?: number;
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
}
