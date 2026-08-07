import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { toPageResult } from 'src/common/types/pagination.types';
import { BusinessScope, Customer } from 'src/entities';

interface SaveCustomerInput {
  customerCode?: string;
  customer_code?: string;
  customerName?: string;
  customer_name?: string;
  isActive?: boolean;
  is_active?: boolean;
  businessScope?: BusinessScope;
  business_scope?: BusinessScope;
}

interface NormalizedCustomerInput {
  customerCode?: string;
  customerName?: string;
  isActive?: boolean;
}

export interface CustomerView {
  id: string;
  customerCode: string;
  customerName: string;
  isActive: boolean;
  createdAt: Date;
  customer_code: string;
  customer_name: string;
  is_active: boolean;
  created_at: Date;
  businessScope: BusinessScope;
  business_scope: BusinessScope;
}

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly repository: Repository<Customer>,
  ) {}

  async list(query: PaginationQueryDto & { isActive?: boolean; is_active?: boolean; onlyUsedInOrders?: boolean; businessScope?: BusinessScope; business_scope?: BusinessScope }) {
    const page = query.page ?? 1;
    const businessScope = query.businessScope ?? query.business_scope ?? BusinessScope.BEILUN;
    const pageSize = query.pageSize ?? 20;

    const qb = this.repository.createQueryBuilder('customer');
    qb.andWhere('customer.businessScope = :businessScope', { businessScope });

    if (query.keyword) {
      qb.andWhere(
        '(customer.customerCode ILIKE :keyword OR customer.customerName ILIKE :keyword)',
        { keyword: `%${query.keyword}%` },
      );
    }

    const isActive = query.isActive ?? query.is_active;
    if (typeof isActive === 'boolean') {
      qb.andWhere('customer.isActive = :isActive', { isActive });
    }

    if (query.onlyUsedInOrders === true) {
      qb.andWhere(`
        EXISTS (
          SELECT 1
          FROM work_orders wo
          WHERE (wo.customer_id = customer.id
             OR wo.customer_code = customer.customer_code)
            AND wo.business_scope = '${businessScope}'
        )
      `);
    }

    qb.orderBy('customer.createdAt', 'DESC');

    const [rows, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return toPageResult(page, pageSize, total, rows.map((row) => this.toView(row)));
  }

  async get(id: string, businessScope: BusinessScope = BusinessScope.BEILUN): Promise<CustomerView> {
    return this.toView(await this.getEntity(id, businessScope));
  }

  async create(input: SaveCustomerInput): Promise<CustomerView> {
    const businessScope = input.businessScope ?? input.business_scope ?? BusinessScope.BEILUN;
    const normalized = this.normalizeInput(input, true);
    const existed = await this.repository.findOne({ where: { customerCode: normalized.customerCode, businessScope } });
    if (existed) {
      throw new BadRequestException('客户编码已存在');
    }

    const entity = this.repository.create({
      customerCode: normalized.customerCode,
      customerName: normalized.customerName,
      isActive: normalized.isActive ?? true,
      businessScope,
    });

    return this.toView(await this.repository.save(entity));
  }

  async update(id: string, input: SaveCustomerInput): Promise<CustomerView> {
    const businessScope = input.businessScope ?? input.business_scope ?? BusinessScope.BEILUN;
    const row = await this.getEntity(id, businessScope);
    const normalized = this.normalizeInput(input, false);

    if (normalized.customerCode && normalized.customerCode !== row.customerCode) {
      const codeExists = await this.repository.findOne({
        where: { customerCode: normalized.customerCode, businessScope },
      });
      if (codeExists) {
        throw new BadRequestException('客户编码已存在');
      }
    }

    Object.assign(row, normalized);
    return this.toView(await this.repository.save(row));
  }

  async remove(id: string, businessScope: BusinessScope = BusinessScope.BEILUN): Promise<{ success: boolean }> {
    const row = await this.getEntity(id, businessScope);
    row.isActive = false;
    await this.repository.save(row);
    return { success: true };
  }

  async toggle(id: string, isActive: boolean, businessScope: BusinessScope = BusinessScope.BEILUN): Promise<CustomerView> {
    const row = await this.getEntity(id, businessScope);
    row.isActive = isActive;
    return this.toView(await this.repository.save(row));
  }

  private async getEntity(id: string, businessScope: BusinessScope): Promise<Customer> {
    const row = await this.repository.findOne({ where: { id, businessScope } });
    if (!row) {
      throw new NotFoundException('客户不存在');
    }

    return row;
  }

  private normalizeInput(input: SaveCustomerInput, requireAll: boolean): NormalizedCustomerInput {
    const customerCode = input.customerCode ?? input.customer_code;
    const customerName = input.customerName ?? input.customer_name;
    const isActive = input.isActive ?? input.is_active;

    if (requireAll && (!customerCode || !customerName)) {
      throw new BadRequestException('客户编码和客户名称必填');
    }

    return {
      ...(customerCode !== undefined ? { customerCode } : {}),
      ...(customerName !== undefined ? { customerName } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    };
  }

  private toView(row: Customer): CustomerView {
    return {
      id: row.id,
      customerCode: row.customerCode,
      customerName: row.customerName,
      isActive: row.isActive,
      createdAt: row.createdAt,
      customer_code: row.customerCode,
      customer_name: row.customerName,
      is_active: row.isActive,
      created_at: row.createdAt,
      businessScope: row.businessScope,
      business_scope: row.businessScope,
    };
  }
}
