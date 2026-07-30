import { DispatchedOrderStatus, OrderType, WorkOrderStatus } from 'src/entities';

export interface PagedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface WorkOrderListItem {
  id: string;
  orderNo: string;
  order_no?: string;
  orderType: OrderType;
  order_type?: OrderType;
  status: WorkOrderStatus;
  customerId: string;
  customer_id?: string;
  customerCode?: string | null;
  customer_code?: string | null;
  customerName?: string | null;
  customer_name?: string | null;
  employeeName: string;
  employee_name?: string;
  employeeIdCard: string;
  employee_id_card?: string;
  createdBy?: string;
  created_by?: string;
  createdByName?: string | null;
  created_by_name?: string | null;
  submittedAt: Date | null;
  submitted_at?: Date | null;
  completedAt: Date | null;
  completed_at?: Date | null;
  createdAt: Date;
  created_at?: Date;
  updatedAt: Date;
  updated_at?: Date;
  dispatchedOrders?: WorkOrderSubOrderItem[];
  dispatched_orders?: WorkOrderSubOrderItem[];
  subOrders?: WorkOrderSubOrderItem[];
  sub_orders?: WorkOrderSubOrderItem[];
}

export interface WorkOrderSubOrderItem {
  id: string;
  moduleCode: string;
  module_code?: string;
  nodeType: string;
  node_type?: string;
  status: DispatchedOrderStatus;
  handlerId: string | null;
  handler_id?: string | null;
  handlerName: string | null;
  handler_name?: string | null;
  visibleFields: string[] | null;
  visible_fields?: string[] | null;
  returnReason: string | null;
  return_reason?: string | null;
  dispatchedAt: Date | null;
  dispatched_at?: Date | null;
  acceptedAt: Date | null;
  accepted_at?: Date | null;
  completedAt: Date | null;
  completed_at?: Date | null;
  voidAt?: Date | null;
  void_at?: Date | null;
  createdAt: Date;
  created_at?: Date;
  dueAt: Date | null;
  due_at?: Date | null;
  isOverdue: boolean;
  is_overdue?: boolean;
}

export interface WorkOrderDetailItem {
  id: string;
  orderNo: string;
  order_no?: string;
  orderType: OrderType;
  order_type?: OrderType;
  status: WorkOrderStatus;
  createdBy: { id: string; username: string; realName: string };
  department: { id: string; name: string };
  customer: { id: string; customerCode: string; customerName: string };
  employeeName: string;
  employee_name?: string;
  employeeIdCard: string;
  employee_id_card?: string;
  extraData: Record<string, unknown>;
  extra_data?: Record<string, unknown>;
  dispatchedOrders: WorkOrderSubOrderItem[];
  subOrders?: WorkOrderSubOrderItem[];
  sub_orders?: WorkOrderSubOrderItem[];
  submittedAt: Date | null;
  submitted_at?: Date | null;
  completedAt: Date | null;
  completed_at?: Date | null;
  createdAt: Date;
  created_at?: Date;
  updatedAt: Date;
  updated_at?: Date;
}

export interface WorkOrderTimelineItem {
  id: string;
  createdAt: Date;
  created_at?: Date;
  operatorId: string | null;
  operator_id?: string | null;
  operatorName: string | null;
  operator_name?: string | null;
  userId: string | null;
  user_id?: string | null;
  userName: string | null;
  user_name?: string | null;
  entityType: string;
  entity_type?: string;
  entityId: string;
  entity_id?: string;
  entityLabel: string;
  entity_label?: string;
  actionCode: string;
  action_code?: string;
  actionType: string;
  action_type?: string;
  actionLabel: string;
  action_label?: string;
  title: string;
  description: string;
  contextFields: Record<string, unknown>;
  context_fields?: Record<string, unknown>;
  beforeData: Record<string, unknown> | null;
  before_data?: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  after_data?: Record<string, unknown> | null;
}

export interface WorkOrderTimelineResponse {
  items: WorkOrderTimelineItem[];
  total: number;
  list: WorkOrderTimelineItem[];
  timeline: WorkOrderTimelineItem[];
}
