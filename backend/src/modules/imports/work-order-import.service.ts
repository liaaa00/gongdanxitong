import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OrderType } from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { WorkOrderService } from 'src/modules/work-orders/work-order.service';

@Injectable()
export class WorkOrderImportService {
  private readonly customerIdCache = new Map<string, string>();

  constructor(
    private readonly workOrderService: WorkOrderService,
    private readonly dataSource: DataSource,
  ) {}

  async writeOne(input: {
    orderType: OrderType;
    normalized: Record<string, unknown>;
    autoSubmit: boolean;
    user: JwtUserPayload;
    defaults?: Record<string, unknown>;
  }): Promise<{ workOrderId: string }> {
    const extraData = { ...(input.defaults ?? {}), ...input.normalized };
    const customerId = await this.resolveImportCustomerId(
      this.readOptionalUuid(extraData.customerId),
      extraData,
    );

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

  private async resolveImportCustomerId(
    customerId: string | undefined,
    extraData: Record<string, unknown>,
  ): Promise<string | undefined> {
    if (customerId) {
      return customerId;
    }

    const customerCode = this.readText(extraData.customer_code);
    const customerName = this.readText(extraData.customer_name);
    if (!customerCode || !customerName) {
      return undefined;
    }

    const cached = this.customerIdCache.get(customerCode);
    if (cached) {
      return cached;
    }

    const existingRows = await this.dataSource.query(
      'SELECT id FROM customers WHERE customer_code = $1 AND is_active = true LIMIT 1',
      [customerCode],
    );
    const existingId = this.readFirstId(existingRows);
    if (existingId) {
      this.customerIdCache.set(customerCode, existingId);
      return existingId;
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
      this.customerIdCache.set(customerCode, createdId);
      return createdId;
    }

    const fallbackRows = await this.dataSource.query(
      'SELECT id FROM customers WHERE customer_code = $1 AND is_active = true LIMIT 1',
      [customerCode],
    );
    const fallbackId = this.readFirstId(fallbackRows);
    if (fallbackId) {
      this.customerIdCache.set(customerCode, fallbackId);
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
