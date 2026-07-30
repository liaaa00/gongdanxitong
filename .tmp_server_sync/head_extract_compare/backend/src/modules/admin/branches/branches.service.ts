import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch, Customer } from 'src/entities';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { toPageResult } from 'src/common/types/pagination.types';

interface SaveBranchInput {
  customerId?: string;
  customer_id?: string;
  branchCode?: string;
  branch_code?: string;
  branchName?: string;
  branch_name?: string;
  city?: string | null;
  isActive?: boolean;
  is_active?: boolean;
}

export interface BranchView {
  id: string;
  customerId: string;
  customer_id: string;
  branchCode: string;
  branch_code: string;
  branchName: string;
  branch_name: string;
  city: string | null;
  isActive: boolean;
  is_active: boolean;
  createdAt: Date;
  created_at: Date;
  customer?: {
    id: string;
    customerCode: string;
    customerName: string;
    customer_code: string;
    customer_name: string;
  };
}

@Injectable()
export class BranchesService {
  constructor(
    @InjectRepository(Branch)
    private readonly repository: Repository<Branch>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
  ) {}

  async list(
    query: PaginationQueryDto & {
      customerId?: string;
      customer_id?: string;
      isActive?: boolean;
      is_active?: boolean;
    },
  ) {
    const page = query.current ?? query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.repository.createQueryBuilder('branch').leftJoinAndSelect('branch.customer', 'customer');
    const customerId = query.customerId ?? query.customer_id;
    const isActive = query.isActive ?? query.is_active;

    if (customerId) qb.andWhere('branch.customerId = :customerId', { customerId });
    if (typeof isActive === 'boolean') qb.andWhere('branch.isActive = :isActive', { isActive });
    if (query.keyword) {
      qb.andWhere(
        '(branch.branchCode ILIKE :keyword OR branch.branchName ILIKE :keyword OR customer.customerCode ILIKE :keyword OR customer.customerName ILIKE :keyword)',
        { keyword: `%${query.keyword}%` },
      );
    }

    const [rows, total] = await qb
      .orderBy('branch.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return toPageResult(
      page,
      pageSize,
      total,
      rows.map((row) => this.toView(row)),
    );
  }

  async get(id: string): Promise<BranchView> {
    return this.toView(await this.getEntity(id));
  }

  async create(input: SaveBranchInput): Promise<BranchView> {
    const normalized = this.normalize(input, true);
    await this.assertCustomer(normalized.customerId!);
    const existed = await this.repository.findOne({ where: { branchCode: normalized.branchCode! } });
    if (existed) throw new BadRequestException('商社代码已存在');

    const row = this.repository.create({
      customerId: normalized.customerId!,
      branchCode: normalized.branchCode!,
      branchName: normalized.branchName!,
      city: normalized.city ?? null,
      isActive: normalized.isActive ?? true,
    });
    return this.toView(await this.repository.save(row));
  }

  async update(id: string, input: SaveBranchInput): Promise<BranchView> {
    const row = await this.getEntity(id);
    const normalized = this.normalize(input, false);

    if (normalized.customerId && normalized.customerId !== row.customerId) {
      await this.assertCustomer(normalized.customerId);
      row.customerId = normalized.customerId;
    }
    if (normalized.branchCode && normalized.branchCode !== row.branchCode) {
      const existed = await this.repository.findOne({ where: { branchCode: normalized.branchCode } });
      if (existed && existed.id !== row.id) throw new BadRequestException('商社代码已存在');
      row.branchCode = normalized.branchCode;
    }
    if (normalized.branchName !== undefined) row.branchName = normalized.branchName;
    if (normalized.city !== undefined) row.city = normalized.city;
    if (normalized.isActive !== undefined) row.isActive = normalized.isActive;

    return this.toView(await this.repository.save(row));
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const row = await this.getEntity(id);
    row.isActive = false;
    await this.repository.save(row);
    return { success: true };
  }

  private async getEntity(id: string): Promise<Branch> {
    const row = await this.repository.findOne({ where: { id }, relations: { customer: true } });
    if (!row) throw new NotFoundException('商社不存在');
    return row;
  }

  private async assertCustomer(customerId: string): Promise<void> {
    const customer = await this.customerRepository.findOne({ where: { id: customerId, isActive: true } });
    if (!customer) throw new BadRequestException('客户不存在或已停用');
  }

  private normalize(
    input: SaveBranchInput,
    requireAll: boolean,
  ): { customerId?: string; branchCode?: string; branchName?: string; city?: string | null; isActive?: boolean } {
    const customerId = input.customerId ?? input.customer_id;
    const branchCode = input.branchCode ?? input.branch_code;
    const branchName = input.branchName ?? input.branch_name;
    const isActive = input.isActive ?? input.is_active;

    if (requireAll && (!customerId || !branchCode || !branchName)) {
      throw new BadRequestException('customerId、branchCode、branchName 必填');
    }

    return { customerId, branchCode, branchName, city: input.city, isActive };
  }

  private toView(row: Branch): BranchView {
    return {
      id: row.id,
      customerId: row.customerId,
      customer_id: row.customerId,
      branchCode: row.branchCode,
      branch_code: row.branchCode,
      branchName: row.branchName,
      branch_name: row.branchName,
      city: row.city,
      isActive: row.isActive,
      is_active: row.isActive,
      createdAt: row.createdAt,
      created_at: row.createdAt,
      ...(row.customer
        ? {
            customer: {
              id: row.customer.id,
              customerCode: row.customer.customerCode,
              customerName: row.customer.customerName,
              customer_code: row.customer.customerCode,
              customer_name: row.customer.customerName,
            },
          }
        : {}),
    };
  }
}
