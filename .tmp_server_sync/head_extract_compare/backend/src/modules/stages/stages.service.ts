import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderStage } from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { CreateOrderStageDto, ListOrderStagesDto } from './dto';

@Injectable()
export class StagesService {
  constructor(
    @InjectRepository(OrderStage)
    private readonly repository: Repository<OrderStage>,
  ) {}

  async create(payload: CreateOrderStageDto, user: JwtUserPayload): Promise<Record<string, unknown>> {
    const row = await this.repository.save(this.repository.create({
      workOrderId: payload.work_order_id,
      dispatchedOrderId: payload.dispatched_order_id ?? null,
      stageCode: payload.stage_code,
      stageName: payload.stage_name,
      stageStatus: payload.stage_status ?? 'done',
      happenedAt: payload.happened_at ? new Date(payload.happened_at) : new Date(),
      operatorId: user.sub,
      payload: payload.payload ?? null,
    }));
    return this.toResponse(row);
  }

  async list(query: ListOrderStagesDto): Promise<OrderStage[]> {
    return this.repository.find({
      where: {
        ...(query.dispatched_order_id ? { dispatchedOrderId: query.dispatched_order_id } : {}),
      },
      order: { happenedAt: 'DESC' },
    });
  }

  private toResponse(row: OrderStage): Record<string, unknown> {
    return {
      id: row.id,
      work_order_id: row.workOrderId,
      dispatched_order_id: row.dispatchedOrderId,
      stage_code: row.stageCode,
      stage_name: row.stageName,
      stage_status: row.stageStatus,
      happened_at: row.happenedAt,
      operator_id: row.operatorId,
      payload: row.payload,
      created_at: row.createdAt,
    };
  }
}
