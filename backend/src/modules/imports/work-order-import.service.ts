import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  BusinessScope,
  InServiceOrderKind,
  OrderType,
} from 'src/entities';
import { businessException } from 'src/common/exceptions/business-exception';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { InServiceOrdersService } from 'src/modules/in-service-orders/in-service-orders.service';
import { WorkOrderService } from 'src/modules/work-orders/work-order.service';
import { applyOnboardingDerivedFields } from './import-derived-fields.util';

@Injectable()
export class WorkOrderImportService {
  private readonly customerIdCache = new Map<string, string>();
  private readonly departmentIdCache = new Map<string, string>();

  constructor(
    private readonly workOrderService: WorkOrderService,
    private readonly dataSource: DataSource,
    private readonly inServiceOrdersService: InServiceOrdersService,
  ) {}

  async writeOne(input: {
    orderType: OrderType;
    normalized: Record<string, unknown>;
    autoSubmit: boolean;
    user: JwtUserPayload;
    defaults?: Record<string, unknown>;
  }): Promise<{ workOrderId: string }> {
    const extraData = { ...(input.defaults ?? {}), ...input.normalized };
    if (input.orderType === OrderType.ONBOARDING) {
      applyOnboardingDerivedFields(extraData);
    }
    const customerId = await this.resolveImportCustomerId(
      this.readOptionalUuid(extraData.customerId),
      extraData,
    );

    if (this.isOutOfProvince(input.orderType)) {
      return this.writeOutOfProvinceOrder(input.orderType, extraData, customerId, input.user);
    }

    const draft = await this.workOrderService.createDraft(
      {
        orderType: input.orderType,
        customerId,
        departmentId: this.readOptionalUuid(extraData.departmentId),
        extraData,
      },
      input.user,
    );

    if (input.autoSubmit) {
      await this.workOrderService.submit(draft.id, {}, input.user);
    }

    return { workOrderId: draft.id };
  }

  private async writeOutOfProvinceOrder(
    orderType: OrderType.OUT_OF_PROVINCE_INCREASE | OrderType.OUT_OF_PROVINCE_DECREASE,
    source: Record<string, unknown>,
    customerId: string | undefined,
    user: JwtUserPayload,
  ): Promise<{ workOrderId: string }> {
    if (!customerId) {
      throw businessException(4811, HttpStatus.BAD_REQUEST, '客户名称未匹配到唯一有效客户');
    }
    const departmentId = await this.resolveImportDepartmentId(
      this.readOptionalUuid(source.departmentId),
      user.sub,
    );
    if (!departmentId) {
      throw businessException(4811, HttpStatus.BAD_REQUEST, '发起人未配置所属部门，无法创建省外工单');
    }

    const orderKind = orderType === OrderType.OUT_OF_PROVINCE_INCREASE
      ? InServiceOrderKind.OUT_OF_PROVINCE_INCREASE
      : InServiceOrderKind.OUT_OF_PROVINCE_DECREASE;
    const extraData: Record<string, unknown> = {
      ...source,
      paymentInstitution: source.paymentInstitution ?? source.payment_institution,
      contractStartDate: source.contractStartDate ?? source.contract_start_date,
      contractEndDate: source.contractEndDate ?? source.contract_end_date,
      lastWorkDate: source.lastWorkDate ?? source.last_work_date,
    };

    const created = await this.inServiceOrdersService.create(
      {
        customerId,
        departmentId,
        orderKind,
        businessScope: BusinessScope.OUT_OF_PROVINCE,
        employeeName: this.readText(source.employee_name),
        idCardNo: this.readText(source.id_card_no),
        province: this.readText(source.province),
        city: this.readText(source.city),
        extraData,
      },
      user,
    );

    return { workOrderId: created.id };
  }

  private isOutOfProvince(
    orderType: OrderType,
  ): orderType is OrderType.OUT_OF_PROVINCE_INCREASE | OrderType.OUT_OF_PROVINCE_DECREASE {
    return orderType === OrderType.OUT_OF_PROVINCE_INCREASE
      || orderType === OrderType.OUT_OF_PROVINCE_DECREASE;
  }

  private async resolveImportDepartmentId(
    departmentId: string | undefined,
    userId: string,
  ): Promise<string | undefined> {
    if (departmentId) {
      return departmentId;
    }
    const cached = this.departmentIdCache.get(userId);
    if (cached) {
      return cached;
    }
    const rows = await this.dataSource.query(
      `
        SELECT department_id AS id
        FROM user_roles
        WHERE user_id = $1
        ORDER BY is_primary DESC, created_at ASC
        LIMIT 1
      `,
      [userId],
    );
    const resolved = this.readFirstId(rows);
    if (resolved) {
      this.departmentIdCache.set(userId, resolved);
    }
    return resolved;
  }

  private async resolveImportCustomerId(
    customerId: string | undefined,
    extraData: Record<string, unknown>,
  ): Promise<string | undefined> {
    if (customerId) {
      return customerId;
    }

    const customerCode = this.readText(extraData.customer_code);
    const customerName = this.readText(extraData.customer_name);
    const cacheKey = customerCode ? `code:${customerCode}` : customerName ? `name:${customerName}` : null;
    if (cacheKey) {
      const cached = this.customerIdCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    if (!customerCode) {
      if (!customerName) {
        return undefined;
      }
      const matchingRows = await this.dataSource.query(
        'SELECT id FROM customers WHERE customer_name = $1 AND is_active = true ORDER BY created_at ASC LIMIT 2',
        [customerName],
      );
      if (!Array.isArray(matchingRows) || matchingRows.length !== 1) {
        return undefined;
      }
      const matchedId = this.readFirstId(matchingRows);
      if (matchedId && cacheKey) {
        this.customerIdCache.set(cacheKey, matchedId);
      }
      return matchedId;
    }

    const existingRows = await this.dataSource.query(
      'SELECT id FROM customers WHERE customer_code = $1 AND is_active = true LIMIT 1',
      [customerCode],
    );
    const existingId = this.readFirstId(existingRows);
    if (existingId) {
      this.customerIdCache.set(`code:${customerCode}`, existingId);
      return existingId;
    }

    if (!customerName) {
      return undefined;
    }
    const createdRows = await this.dataSource.query(
      `
        INSERT INTO customers (customer_code, customer_name, is_active)
        VALUES ($1, $2, true)
        ON CONFLICT (customer_code) DO UPDATE
          SET customer_name = EXCLUDED.customer_name,
              is_active = true
        RETURNING id
      `,
      [customerCode, customerName],
    );
    const createdId = this.readFirstId(createdRows);
    if (createdId) {
      this.customerIdCache.set(`code:${customerCode}`, createdId);
      return createdId;
    }

    const fallbackRows = await this.dataSource.query(
      'SELECT id FROM customers WHERE customer_code = $1 AND is_active = true LIMIT 1',
      [customerCode],
    );
    const fallbackId = this.readFirstId(fallbackRows);
    if (fallbackId) {
      this.customerIdCache.set(`code:${customerCode}`, fallbackId);
    }
    return fallbackId;
  }

  private readFirstId(rows: unknown): string | undefined {
    if (!Array.isArray(rows) || rows.length === 0) {
      return undefined;
    }

    const id = (rows[0] as { id?: unknown }).id;
    return typeof id === 'string' && id.trim().length > 0 ? id.trim() : undefined;
  }

  private readText(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }

  private readOptionalUuid(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }
}
