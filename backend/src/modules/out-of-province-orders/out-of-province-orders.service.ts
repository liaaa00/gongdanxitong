import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  BUSINESS_LEADER_ROLES,
  BUSINESS_MANAGER_ROLES,
  hasAnyRole,
  isAdminRole,
} from 'src/common/auth/role-permissions';
import { isOutOfProvinceDispatchModule } from 'src/common/constants/dispatch-modules';
import {
  BusinessScope,
  DispatchedOrder,
  WorkOrder,
} from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import {
  toWorkOrderListItem,
  toWorkOrderSubOrderItems,
} from 'src/modules/work-orders/work-order.mapper';
import { WorkOrderService } from 'src/modules/work-orders/work-order.service';
import {
  PagedResponse,
  WorkOrderDetailItem,
  WorkOrderListItem,
} from 'src/modules/work-orders/work-order.types';
import { WorkOrderValidationService } from 'src/modules/work-orders/work-order-validation.service';
import { SubmitWorkOrderDto } from 'src/modules/work-orders/dto/submit.dto';
import { CreateOutOfProvinceOrderDto, OUT_OF_PROVINCE_ORDER_TYPES } from './dto/create-out-of-province-order.dto';
import { ListOutOfProvinceOrderQueryDto } from './dto/list-out-of-province-order.dto';
import { UpdateOutOfProvinceOrderDto } from './dto/update-out-of-province-order.dto';

@Injectable()
export class OutOfProvinceOrdersService {
  constructor(
    @InjectRepository(WorkOrder)
    private readonly workOrderRepository: Repository<WorkOrder>,
    @InjectRepository(DispatchedOrder)
    private readonly dispatchedOrderRepository: Repository<DispatchedOrder>,
    private readonly workOrderService: WorkOrderService,
    private readonly validationService: WorkOrderValidationService,
  ) {}

  async create(dto: CreateOutOfProvinceOrderDto, user: JwtUserPayload): Promise<WorkOrderDetailItem> {
    return this.workOrderService.createDraft({
      orderType: dto.orderType,
      customerId: dto.customerId,
      departmentId: dto.departmentId,
      extraData: {
        ...dto.extraData,
        province: dto.province,
      },
    }, user);
  }

  async findAll(
    query: ListOutOfProvinceOrderQueryDto,
    user: JwtUserPayload,
  ): Promise<PagedResponse<WorkOrderListItem>> {
    const qb = this.workOrderRepository.createQueryBuilder('w')
      .leftJoinAndSelect('w.creator', 'creator')
      .where('w.business_scope = :businessScope', {
        businessScope: BusinessScope.OUT_OF_PROVINCE,
      })
      .andWhere('w.order_type IN (:...orderTypes)', {
        orderTypes: [...OUT_OF_PROVINCE_ORDER_TYPES],
      });

    if (!isAdminRole(user.roles)) {
      if (hasAnyRole(user.roles, BUSINESS_MANAGER_ROLES)) {
        const departmentIds = await this.validationService.resolveUserDepartmentIds(user.sub);
        if (departmentIds.length === 0) {
          return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
        }
        qb.andWhere('w.department_id IN (:...departmentIds)', { departmentIds });
      } else {
        qb.andWhere('w.created_by = :createdBy', { createdBy: user.sub });
      }
    }

    if (query.orderType) {
      qb.andWhere('w.order_type = :orderType', { orderType: query.orderType });
    }
    if (query.status) {
      qb.andWhere('w.status = :status', { status: query.status });
    }
    if (query.province) {
      qb.andWhere("w.extra_data->>'province' = :province", { province: query.province });
    }
    if (query.keyword) {
      qb.andWhere(`(
        w.order_no ILIKE :keyword
        OR w.employee_name ILIKE :keyword
        OR w.employee_id_card ILIKE :keyword
        OR w.customer_code ILIKE :keyword
        OR w.customer_name ILIKE :keyword
      )`, { keyword: `%${query.keyword}%` });
    }

    const total = await qb.getCount();
    const rows = await qb
      .orderBy('w.created_at', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize)
      .getMany();
    const childrenByParent = new Map<string, DispatchedOrder[]>();
    if (rows.length > 0) {
      const children = await this.dispatchedOrderRepository.find({
        where: { parentOrderId: In(rows.map((row) => row.id)) },
        relations: { handler: true },
      });
      for (const child of children.filter((item) => isOutOfProvinceDispatchModule(item.moduleCode))) {
        const bucket = childrenByParent.get(child.parentOrderId) ?? [];
        bucket.push(child);
        childrenByParent.set(child.parentOrderId, bucket);
      }
    }

    return {
      items: rows.map((row) => toWorkOrderListItem(
        row,
        toWorkOrderSubOrderItems(childrenByParent.get(row.id) ?? []),
      )),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findOne(id: string, user: JwtUserPayload): Promise<WorkOrderDetailItem> {
    const order = await this.findScopedEntity(id);
    await this.assertCanRead(order, user);
    return this.toDetail(order);
  }

  async update(
    id: string,
    dto: UpdateOutOfProvinceOrderDto,
    user: JwtUserPayload,
  ): Promise<WorkOrderDetailItem> {
    const order = await this.findScopedEntity(id);
    this.assertOwner(order, user);
    const extraData = dto.extraData || dto.province
      ? { ...(dto.extraData ?? {}), ...(dto.province ? { province: dto.province } : {}) }
      : undefined;
    return this.workOrderService.update(id, {
      customerId: dto.customerId,
      departmentId: dto.departmentId,
      extraData,
    }, user);
  }

  async submit(id: string, dto: SubmitWorkOrderDto, user: JwtUserPayload) {
    const order = await this.findScopedEntity(id);
    this.assertOwner(order, user);
    return this.workOrderService.submit(id, dto, user);
  }

  async resubmit(id: string, dto: SubmitWorkOrderDto, user: JwtUserPayload) {
    const order = await this.findScopedEntity(id);
    this.assertOwner(order, user);
    return this.workOrderService.resubmit(id, dto, user);
  }

  private async findScopedEntity(id: string): Promise<WorkOrder> {
    const order = await this.workOrderRepository.findOne({
      where: {
        id,
        businessScope: BusinessScope.OUT_OF_PROVINCE,
        orderType: In([...OUT_OF_PROVINCE_ORDER_TYPES]),
      },
      relations: {
        creator: true,
        department: true,
        customer: true,
        dispatchedOrders: { handler: true },
      },
    });
    if (!order) {
      throw new NotFoundException('Out-of-province order not found');
    }
    return order;
  }

  private async assertCanRead(order: WorkOrder, user: JwtUserPayload): Promise<void> {
    if (isAdminRole(user.roles) || order.createdBy === user.sub) return;
    if (hasAnyRole(user.roles, [...BUSINESS_MANAGER_ROLES, ...BUSINESS_LEADER_ROLES])) {
      const departmentIds = await this.validationService.resolveUserDepartmentIds(user.sub);
      if (departmentIds.includes(order.departmentId)) return;
    }
    if (order.dispatchedOrders.some((child) =>
      isOutOfProvinceDispatchModule(child.moduleCode) && child.handlerId === user.sub)) return;
    throw new ForbiddenException('No access to this out-of-province order');
  }

  private assertOwner(order: WorkOrder, user: JwtUserPayload): void {
    if (order.createdBy !== user.sub) {
      throw new ForbiddenException('Only the creator can change this out-of-province order');
    }
  }

  private toDetail(order: WorkOrder): WorkOrderDetailItem {
    const subOrders = toWorkOrderSubOrderItems(
      order.dispatchedOrders.filter((child) => isOutOfProvinceDispatchModule(child.moduleCode)),
    );
    return {
      id: order.id,
      orderNo: order.orderNo,
      order_no: order.orderNo,
      orderType: order.orderType,
      order_type: order.orderType,
      businessScope: order.businessScope,
      business_scope: order.businessScope,
      status: order.status,
      createdBy: {
        id: order.creator.id,
        username: order.creator.username,
        realName: order.creator.realName,
      },
      department: { id: order.department.id, name: order.department.name },
      customer: {
        id: order.customer.id,
        customerCode: order.customer.customerCode,
        customerName: order.customer.customerName,
      },
      employeeName: order.employeeName,
      employee_name: order.employeeName,
      employeeIdCard: order.employeeIdCard,
      employee_id_card: order.employeeIdCard,
      extraData: order.extraData,
      extra_data: order.extraData,
      dispatchedOrders: subOrders,
      subOrders,
      sub_orders: subOrders,
      submittedAt: order.submittedAt,
      submitted_at: order.submittedAt,
      completedAt: order.completedAt,
      completed_at: order.completedAt,
      createdAt: order.createdAt,
      created_at: order.createdAt,
      updatedAt: order.updatedAt,
      updated_at: order.updatedAt,
    };
  }
}
