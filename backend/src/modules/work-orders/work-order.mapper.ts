import { DispatchedOrder, DispatchedOrderStatus, WorkOrder } from 'src/entities';
import { WorkOrderListItem, WorkOrderSubOrderItem } from './work-order.types';

export function snapshotWorkOrder(workOrder: WorkOrder): Record<string, unknown> {
  return {
    id: workOrder.id,
    orderNo: workOrder.orderNo,
    orderType: workOrder.orderType,
    status: workOrder.status,
    createdBy: workOrder.createdBy,
    departmentId: workOrder.departmentId,
    customerId: workOrder.customerId,
    employeeName: workOrder.employeeName,
    employeeIdCard: workOrder.employeeIdCard,
    extraData: workOrder.extraData,
    submittedAt: workOrder.submittedAt,
    completedAt: workOrder.completedAt,
    updatedAt: workOrder.updatedAt,
  };
}

export function calculateSubOrderDueAt(child: DispatchedOrder): Date | null {
  if (child.dueAt) return child.dueAt;
  if (child.dispatchedAt && child.slaHours && child.slaHours > 0) {
    return new Date(child.dispatchedAt.getTime() + child.slaHours * 60 * 60 * 1000);
  }
  return null;
}

export function toWorkOrderSubOrderItem(child: DispatchedOrder): WorkOrderSubOrderItem {
  const dueAt = calculateSubOrderDueAt(child);
  const isOverdue = child.status !== DispatchedOrderStatus.COMPLETED && dueAt !== null && dueAt.getTime() < Date.now();
  return {
    id: child.id,
    moduleCode: child.moduleCode,
    module_code: child.moduleCode,
    nodeType: child.moduleCode,
    node_type: child.moduleCode,
    status: child.status,
    handlerId: child.handlerId,
    handler_id: child.handlerId,
    handlerName: child.handler?.realName ?? null,
    handler_name: child.handler?.realName ?? null,
    visibleFields: child.visibleFields,
    visible_fields: child.visibleFields,
    returnReason: child.returnReason,
    return_reason: child.returnReason,
    dispatchedAt: child.dispatchedAt,
    dispatched_at: child.dispatchedAt,
    acceptedAt: child.acceptedAt,
    accepted_at: child.acceptedAt,
    completedAt: child.completedAt,
    completed_at: child.completedAt,
    voidAt: child.voidAt ?? null,
    void_at: child.voidAt ?? null,
    createdAt: child.createdAt,
    created_at: child.createdAt,
    dueAt,
    due_at: dueAt,
    isOverdue,
    is_overdue: isOverdue,
  };
}

export function toWorkOrderSubOrderItems(children: DispatchedOrder[]): WorkOrderSubOrderItem[] {
  return children.map((child) => toWorkOrderSubOrderItem(child));
}

function readText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export function toWorkOrderListItem(workOrder: WorkOrder, subOrders: WorkOrderSubOrderItem[] = []): WorkOrderListItem {
  const extraData = workOrder.extraData ?? {};
  const customerCode = readText(extraData.customer_code) ?? workOrder.customerCode;
  const customerName = readText(extraData.customer_name) ?? workOrder.customerName;
  const employeeName = readText(extraData.employee_name) ?? workOrder.employeeName;
  const employeeIdCard = readText(extraData.id_card_no ?? extraData.employee_id_card) ?? workOrder.employeeIdCard;
  const createdByName = readText(workOrder.creator?.realName) ?? readText(workOrder.creator?.username) ?? workOrder.createdBy;
  return {
    id: workOrder.id,
    orderNo: workOrder.orderNo,
    order_no: workOrder.orderNo,
    orderType: workOrder.orderType,
    order_type: workOrder.orderType,
    status: workOrder.status,
    customerId: workOrder.customerId,
    customer_id: workOrder.customerId,
    customerCode,
    customer_code: customerCode,
    customerName,
    customer_name: customerName,
    employeeName,
    employee_name: employeeName,
    employeeIdCard,
    employee_id_card: employeeIdCard,
    createdBy: workOrder.createdBy,
    created_by: workOrder.createdBy,
    createdByName: createdByName,
    created_by_name: createdByName,
    submittedAt: workOrder.submittedAt,
    submitted_at: workOrder.submittedAt,
    completedAt: workOrder.completedAt,
    completed_at: workOrder.completedAt,
    createdAt: workOrder.createdAt,
    created_at: workOrder.createdAt,
    updatedAt: workOrder.updatedAt,
    updated_at: workOrder.updatedAt,
    dispatchedOrders: subOrders,
    dispatched_orders: subOrders,
    subOrders,
    sub_orders: subOrders,
  };
}
