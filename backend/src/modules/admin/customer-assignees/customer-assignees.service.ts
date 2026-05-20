import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer, CustomerAssignee, User } from 'src/entities';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { toPageResult } from 'src/common/types/pagination.types';

interface SaveCustomerAssigneeInput {
  customerId?: string;
  customer_id?: string;
  userId?: string;
  user_id?: string;
  groupCode?: string | null;
  group_code?: string | null;
  isActive?: boolean;
  is_active?: boolean;
}

export interface CustomerAssigneeView {
  id: string;
  customerId: string;
  customer_id: string;
  userId: string;
  user_id: string;
  groupCode: string | null;
  group_code: string | null;
  isActive: boolean;
  is_active: boolean;
  assignedAt: Date;
  assigned_at: Date;
  customer?: { id: string; customerCode: string; customerName: string; customer_code: string; customer_name: string };
  user?: { id: string; username: string; realName: string; real_name: string };
}

@Injectable()
export class CustomerAssigneesService {
  constructor(
    @InjectRepository(CustomerAssignee)
    private readonly repository: Repository<CustomerAssignee>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async list(query: PaginationQueryDto & { customerId?: string; customer_id?: string; userId?: string; user_id?: string; isActive?: boolean; is_active?: boolean }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.repository
      .createQueryBuilder('assignee')
      .leftJoinAndSelect('assignee.customer', 'customer')
      .leftJoinAndSelect('assignee.user', 'user');

    const customerId = query.customerId ?? query.customer_id;
    const userId = query.userId ?? query.user_id;
    const isActive = query.isActive ?? query.is_active;

    if (customerId) qb.andWhere('assignee.customerId = :customerId', { customerId });
    if (userId) qb.andWhere('assignee.userId = :userId', { userId });
    if (typeof isActive === 'boolean') qb.andWhere('assignee.isActive = :isActive', { isActive });
    if (query.keyword) {
      qb.andWhere('(customer.customerCode ILIKE :keyword OR customer.customerName ILIKE :keyword OR user.realName ILIKE :keyword OR user.username ILIKE :keyword)', { keyword: `%${query.keyword}%` });
    }

    const [rows, total] = await qb.orderBy('assignee.assignedAt', 'DESC').skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    return toPageResult(page, pageSize, total, rows.map((row) => this.toView(row)));
  }

  async get(id: string): Promise<CustomerAssigneeView> {
    return this.toView(await this.getEntity(id));
  }

  async create(input: SaveCustomerAssigneeInput): Promise<CustomerAssigneeView> {
    const normalized = this.normalize(input, true);
    await this.assertRefs(normalized.customerId!, normalized.userId!);
    const existed = await this.repository.findOne({ where: { customerId: normalized.customerId, userId: normalized.userId } });
    if (existed) {
      if (!existed.isActive) {
        existed.isActive = true;
        existed.groupCode = normalized.groupCode ?? existed.groupCode;
        return this.toView(await this.repository.save(existed));
      }
      throw new BadRequestException('客户已绑定该业务员');
    }
    const row = this.repository.create({
      customerId: normalized.customerId!,
      userId: normalized.userId!,
      groupCode: normalized.groupCode ?? null,
      isActive: normalized.isActive ?? true,
    });
    return this.toView(await this.repository.save(row));
  }

  async update(id: string, input: SaveCustomerAssigneeInput): Promise<CustomerAssigneeView> {
    const row = await this.getEntity(id);
    const normalized = this.normalize(input, false);
    const nextCustomerId = normalized.customerId ?? row.customerId;
    const nextUserId = normalized.userId ?? row.userId;
    if (nextCustomerId !== row.customerId || nextUserId !== row.userId) {
      await this.assertRefs(nextCustomerId, nextUserId);
      const existed = await this.repository.findOne({ where: { customerId: nextCustomerId, userId: nextUserId } });
      if (existed && existed.id !== row.id) throw new BadRequestException('客户已绑定该业务员');
      row.customerId = nextCustomerId;
      row.userId = nextUserId;
    }
    if (normalized.groupCode !== undefined) row.groupCode = normalized.groupCode;
    if (normalized.isActive !== undefined) row.isActive = normalized.isActive;
    return this.toView(await this.repository.save(row));
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const row = await this.getEntity(id);
    row.isActive = false;
    await this.repository.save(row);
    return { success: true };
  }

  private async getEntity(id: string): Promise<CustomerAssignee> {
    const row = await this.repository.findOne({ where: { id }, relations: { customer: true, user: true } });
    if (!row) throw new NotFoundException('客户业务员绑定不存在');
    return row;
  }

  private async assertRefs(customerId: string, userId: string): Promise<void> {
    const [customer, user] = await Promise.all([
      this.customerRepository.findOne({ where: { id: customerId, isActive: true } }),
      this.userRepository.findOne({ where: { id: userId, isActive: true } }),
    ]);
    if (!customer) throw new BadRequestException('客户不存在或已停用');
    if (!user) throw new BadRequestException('用户不存在或已停用');
  }

  private normalize(input: SaveCustomerAssigneeInput, requireAll: boolean): { customerId?: string; userId?: string; groupCode?: string | null; isActive?: boolean } {
    const customerId = input.customerId ?? input.customer_id;
    const userId = input.userId ?? input.user_id;
    const groupCode = input.groupCode ?? input.group_code;
    const isActive = input.isActive ?? input.is_active;
    if (requireAll && (!customerId || !userId)) throw new BadRequestException('customerId 和 userId 必填');
    return { customerId, userId, groupCode, isActive };
  }

  private toView(row: CustomerAssignee): CustomerAssigneeView {
    return {
      id: row.id,
      customerId: row.customerId,
      customer_id: row.customerId,
      userId: row.userId,
      user_id: row.userId,
      groupCode: row.groupCode,
      group_code: row.groupCode,
      isActive: row.isActive,
      is_active: row.isActive,
      assignedAt: row.assignedAt,
      assigned_at: row.assignedAt,
      ...(row.customer ? { customer: { id: row.customer.id, customerCode: row.customer.customerCode, customerName: row.customer.customerName, customer_code: row.customer.customerCode, customer_name: row.customer.customerName } } : {}),
      ...(row.user ? { user: { id: row.user.id, username: row.user.username, realName: row.user.realName, real_name: row.user.realName } } : {}),
    };
  }
}
