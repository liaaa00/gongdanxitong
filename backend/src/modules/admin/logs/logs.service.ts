import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { FieldConfig, OperationLog } from 'src/entities';
import { computeOperationLogDiffs, OperationLogDiffItem } from 'src/modules/operation-logs/operation-log-diff';
import {
  humanizeActionCode,
  humanizeEntityType,
  toOperationLogActionCode,
} from 'src/modules/operation-logs/operation-log-semantics';

interface LogQuery extends PaginationQueryDto {
  entityType?: string;
  entity_type?: string;
  entityId?: string;
  entity_id?: string;
  userId?: string;
  operatorId?: string;
  actionCode?: string;
  actionType?: string;
  action_type?: string;
  startAt?: string;
  endAt?: string;
}

export interface OperationLogView {
  id: string;
  createdAt: Date;
  operatorId: string | null;
  operatorName: string | null;
  entityType: string;
  entityId: string;
  entityLabel: string;
  actionCode: string;
  actionLabel: string;
  diffs?: OperationLogDiffItem[];
  remark?: string | null;
  extra?: Record<string, unknown> | null;
  userId: string | null;
  userName: string | null;
  actionType: string;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  ipAddress: string | null;
}

@Injectable()
export class LogsService {
  constructor(
    @InjectRepository(OperationLog)
    private readonly repository: Repository<OperationLog>,
    @InjectRepository(FieldConfig)
    private readonly fieldConfigRepository: Repository<FieldConfig>,
  ) {}

  async list(query: LogQuery): Promise<{
    items: OperationLogView[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    list: OperationLogView[];
    timeline: OperationLogView[];
  }> {
    const page = query.current ?? query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.repository.createQueryBuilder('log').leftJoinAndSelect('log.user', 'user');
    const entityType = query.entityType ?? query.entity_type;
    const entityId = query.entityId ?? query.entity_id;
    const operatorId = query.operatorId ?? query.userId;
    const actionCode = query.actionCode ?? query.actionType ?? query.action_type;

    if (entityType) qb.andWhere('log.entityType = :entityType', { entityType });
    if (entityId) qb.andWhere('log.entityId = :entityId', { entityId });
    if (operatorId) qb.andWhere('log.userId = :operatorId', { operatorId });
    if (actionCode) {
      const separatorIndex = actionCode.lastIndexOf('.');
      if (separatorIndex > 0) {
        qb.andWhere('log.entityType = :actionEntityType', { actionEntityType: actionCode.slice(0, separatorIndex) });
        qb.andWhere('log.actionType = :actionType', { actionType: actionCode.slice(separatorIndex + 1) });
      } else {
        qb.andWhere('log.actionType = :actionType', { actionType: actionCode });
      }
    }
    if (query.startAt) qb.andWhere('log.createdAt >= :startAt', { startAt: query.startAt });
    if (query.endAt) qb.andWhere('log.createdAt <= :endAt', { endAt: query.endAt });

    qb.orderBy('log.createdAt', 'DESC');
    const [rows, total] = await qb.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const fieldNameMap = await this.loadFieldNameMap();
    const items = rows.map((row) => this.toOperationLogView(row, fieldNameMap));

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      list: items,
      timeline: items,
    };
  }

  async detail(id: string): Promise<OperationLogView & { timeline: OperationLogView[] }> {
    const log = await this.repository.findOne({ where: { id }, relations: { user: true } });
    if (!log) {
      throw new NotFoundException('日志不存在');
    }
    const fieldNameMap = await this.loadFieldNameMap();
    const view = this.toOperationLogView(log, fieldNameMap);
    return {
      ...view,
      timeline: [view],
    };
  }

  private resolveOperatorName(user: OperationLog['user']): string | null {
    return this.readOperatorName(user?.realName) ?? this.readOperatorName(user?.username);
  }

  private readOperatorName(value: string | null | undefined): string | null {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    return null;
  }

  private toOperationLogView(log: OperationLog, fieldNameMap: Map<string, string>): OperationLogView {
    const actionCode = toOperationLogActionCode(log.entityType, log.actionType);
    const diffs = computeOperationLogDiffs(log.beforeData, log.afterData, fieldNameMap);
    const extra = this.resolveExtra(log.afterData);
    const operatorName = this.resolveOperatorName(log.user);
    return {
      id: log.id,
      createdAt: log.createdAt,
      operatorId: log.userId,
      operatorName,
      entityType: log.entityType,
      entityId: log.entityId,
      entityLabel: humanizeEntityType(log.entityType),
      actionCode,
      actionLabel: humanizeActionCode(actionCode),
      diffs,
      remark: this.resolveRemark(log.afterData),
      extra,
      userId: log.userId,
      userName: operatorName,
      actionType: log.actionType,
      beforeData: log.beforeData,
      afterData: log.afterData,
      ipAddress: log.ipAddress,
    };
  }

  private async loadFieldNameMap(): Promise<Map<string, string>> {
    const fields = await this.fieldConfigRepository.find({ select: { fieldCode: true, fieldName: true } });
    return new Map(fields.map((field) => [field.fieldCode, field.fieldName]));
  }

  private resolveRemark(data: Record<string, unknown> | null): string | null {
    if (!data) return null;
    const value = data.remark ?? data.returnReason ?? data.reason ?? data.completionRemark;
    return typeof value === 'string' ? value : null;
  }

  private resolveExtra(data: Record<string, unknown> | null): Record<string, unknown> | null {
    if (!data) return null;
    return data;
  }
}
