import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { CreateWorkflowDto, ListWorkflowQueryDto, PublishWorkflowDto, UpdateWorkflowDto } from './dto/workflow.dto';
import { WorkflowDefinition, WorkflowDefinitionStatus } from './workflow.entity';

type WorkflowListResponse = {
  items: WorkflowDefinition[];
  total: number;
  page: number;
  pageSize: number;
};

type WorkflowInput = CreateWorkflowDto | UpdateWorkflowDto | PublishWorkflowDto;

@Injectable()
export class WorkflowService {
  constructor(
    @InjectRepository(WorkflowDefinition)
    private readonly workflowRepository: Repository<WorkflowDefinition>,
  ) {}

  async list(query: ListWorkflowQueryDto): Promise<WorkflowListResponse> {
    const page = query.current ?? query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: FindOptionsWhere<WorkflowDefinition>[] = [];
    const base: FindOptionsWhere<WorkflowDefinition> = {};
    const orderType = query.orderType ?? query.order_type;
    if (orderType) base.orderType = orderType;
    if (query.status) base.status = query.status;

    const keyword = query.keyword?.trim();
    if (keyword) {
      where.push({ ...base, name: ILike(`%${keyword}%`) });
      where.push({ ...base, description: ILike(`%${keyword}%`) });
    }

    const [items, total] = await this.workflowRepository.findAndCount({
      where: where.length > 0 ? where : base,
      order: { updatedAt: 'DESC', createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return { items, total, page, pageSize };
  }

  async get(id: string): Promise<WorkflowDefinition> {
    const workflow = await this.workflowRepository.findOne({ where: { id } });
    if (!workflow) {
      throw new NotFoundException('工作流定义未找到');
    }
    return workflow;
  }

  async create(payload: CreateWorkflowDto, user: JwtUserPayload): Promise<WorkflowDefinition> {
    const workflow = this.workflowRepository.create({
      name: payload.name,
      orderType: this.readOrderType(payload),
      description: payload.description ?? null,
      definitionJson: this.readRequiredDefinition(payload),
      status: WorkflowDefinitionStatus.DRAFT,
      createdBy: user.sub,
    });
    return this.workflowRepository.save(workflow);
  }

  async update(id: string, payload: UpdateWorkflowDto): Promise<WorkflowDefinition> {
    const workflow = await this.get(id);
    this.applyPatch(workflow, payload);
    return this.workflowRepository.save(workflow);
  }

  async publish(id: string, payload: PublishWorkflowDto): Promise<WorkflowDefinition> {
    const workflow = await this.get(id);
    this.applyPatch(workflow, payload);
    this.assertPlainObject(workflow.definitionJson, 'definition_json must be a valid object');
    this.validateEngineDefinition(workflow.definitionJson);
    await this.workflowRepository.update(
      { orderType: workflow.orderType, status: WorkflowDefinitionStatus.PUBLISHED },
      { status: WorkflowDefinitionStatus.DRAFT },
    );
    workflow.status = WorkflowDefinitionStatus.PUBLISHED;
    return this.workflowRepository.save(workflow);
  }

  async deactivate(id: string): Promise<WorkflowDefinition> {
    const workflow = await this.get(id);
    workflow.status = WorkflowDefinitionStatus.ARCHIVED;
    return this.workflowRepository.save(workflow);
  }

  async remove(id: string): Promise<{ success: boolean; id: string }> {
    const workflow = await this.get(id);
    await this.workflowRepository.remove(workflow);
    return { success: true, id };
  }

  private validateEngineDefinition(definition: Record<string, unknown>): void {
    const nodes = Array.isArray(definition.nodes) ? definition.nodes as Array<Record<string, unknown>> : [];
    const edges = Array.isArray(definition.edges) ? definition.edges as Array<Record<string, unknown>> : [];
    if (nodes.length === 0) throw new BadRequestException('流程至少需要配置一个节点');
    const nodeIds = new Set(nodes.map((node) => String(node.id || '').trim()).filter(Boolean));
    if (!nodes.some((node) => node.type === 'start')) throw new BadRequestException('流程必须包含开始节点');
    if (!nodes.some((node) => node.type === 'end')) throw new BadRequestException('流程必须包含结束节点');
    if (nodeIds.size !== nodes.length) throw new BadRequestException('流程节点编码不能为空且不能重复');

    for (const node of nodes) {
      const type = String(node.type || 'process');
      if (!['start', 'process', 'approval', 'end'].includes(type)) {
        throw new BadRequestException(`节点 ${node.id} 类型不正确`);
      }
      const generationRule = node.generation_rule as Record<string, unknown> | undefined;
      const generationMode = String(generationRule?.mode || '').trim();
      if (generationMode && !['always', 'condition', 'manual', 'disabled'].includes(generationMode)) {
        throw new BadRequestException(`节点 ${node.label || node.id} 生成方式不正确`);
      }
      const slaHours = node.sla_hours;
      if (slaHours !== undefined && slaHours !== null && (!Number.isFinite(Number(slaHours)) || Number(slaHours) < 0)) {
        throw new BadRequestException(`节点 ${node.label || node.id} SLA 小时必须为非负数`);
      }
    }

    for (const edge of edges) {
      const source = String(edge.source || '').trim();
      const target = String(edge.target || '').trim();
      if (!nodeIds.has(source) || !nodeIds.has(target)) {
        throw new BadRequestException(`连线 ${edge.id || ''} 引用了不存在的节点`);
      }
    }
  }

  private applyPatch(workflow: WorkflowDefinition, payload: UpdateWorkflowDto | PublishWorkflowDto): void {
    if (payload.name !== undefined) workflow.name = payload.name;
    const orderType = this.readOptionalOrderType(payload);
    if (orderType !== undefined) workflow.orderType = orderType;
    if (payload.description !== undefined) workflow.description = payload.description ?? null;
    const definitionJson = this.readOptionalDefinition(payload);
    if (definitionJson !== undefined) workflow.definitionJson = definitionJson;
  }

  private readOrderType(payload: CreateWorkflowDto): WorkflowDefinition['orderType'] {
    return payload.orderType ?? payload.order_type ?? this.failBadRequest('order_type is required');
  }

  private readOptionalOrderType(payload: WorkflowInput): WorkflowDefinition['orderType'] | undefined {
    return payload.orderType ?? payload.order_type;
  }

  private readRequiredDefinition(payload: CreateWorkflowDto): Record<string, unknown> {
    const definitionJson = this.readOptionalDefinition(payload);
    if (definitionJson === undefined) {
      throw new BadRequestException('definition_json 为必填');
    }
    return definitionJson;
  }

  private readOptionalDefinition(payload: WorkflowInput): Record<string, unknown> | undefined {
    const definitionJson = payload.definitionJson ?? payload.definition_json;
    if (definitionJson === undefined) return undefined;
    this.assertPlainObject(definitionJson, 'definition_json must be a valid object');
    return definitionJson;
  }

  private assertPlainObject(value: unknown, message: string): asserts value is Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException(message);
    }
  }

  private failBadRequest(message: string): never {
    throw new BadRequestException(message);
  }
}
