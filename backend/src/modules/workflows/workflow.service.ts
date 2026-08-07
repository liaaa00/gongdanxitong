import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { CreateWorkflowDto, ListWorkflowQueryDto, PublishWorkflowDto, UpdateWorkflowDto } from './dto/workflow.dto';
import { BusinessScope, InServiceOrderStatus } from 'src/entities';
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
    const base: FindOptionsWhere<WorkflowDefinition> = { businessScope: query.businessScope ?? BusinessScope.BEILUN };
    const orderType = query.orderType ?? query.order_type;
    if (orderType) base.orderType = orderType;
    if (query.flowKey) base.flowKey = this.normalizeFlowKey(query.flowKey);
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

  async get(id: string, businessScope: BusinessScope = BusinessScope.BEILUN): Promise<WorkflowDefinition> {
    const workflow = await this.workflowRepository.findOne({ where: { id, businessScope } });
    if (!workflow) {
      throw new NotFoundException('工作流定义未找到');
    }
    return workflow;
  }

  async getActiveForFlow(flowKey: string, businessScope: BusinessScope = BusinessScope.BEILUN): Promise<WorkflowDefinition | null> {
    return this.workflowRepository.findOne({
      where: {
        flowKey: this.normalizeFlowKey(flowKey),
        businessScope,
        status: WorkflowDefinitionStatus.PUBLISHED,
      },
      order: { updatedAt: 'DESC' },
    });
  }

  async create(payload: CreateWorkflowDto, user: JwtUserPayload): Promise<WorkflowDefinition> {
    const workflow = this.workflowRepository.create({
      name: payload.name,
      orderType: this.readOptionalOrderType(payload) ?? null,
      flowKey: this.readOptionalFlowKey(payload),
      description: payload.description ?? null,
      definitionJson: this.readRequiredDefinition(payload),
      publishedDefinitionJson: null,
      version: 0,
      publishedAt: null,
      status: WorkflowDefinitionStatus.DRAFT,
      businessScope: payload.businessScope ?? BusinessScope.BEILUN,
      createdBy: user.sub,
    });
    this.assertFlowIdentity(workflow.orderType, workflow.flowKey);
    return this.workflowRepository.save(workflow);
  }

  async update(id: string, payload: UpdateWorkflowDto): Promise<WorkflowDefinition> {
    const workflow = await this.get(id, payload.businessScope ?? BusinessScope.BEILUN);
    this.applyPatch(workflow, payload);
    return this.workflowRepository.save(workflow);
  }

  async publish(id: string, payload: PublishWorkflowDto): Promise<WorkflowDefinition> {
    const workflow = await this.get(id, payload.businessScope ?? BusinessScope.BEILUN);
    this.applyPatch(workflow, payload);
    this.assertPlainObject(workflow.definitionJson, 'definition_json must be a valid object');
    this.validateEngineDefinition(workflow.definitionJson);
    this.validateStatusTransitions(workflow.definitionJson, workflow.flowKey);
    if (!workflow.flowKey && workflow.orderType) {
      await this.workflowRepository.update(
        { orderType: workflow.orderType, businessScope: workflow.businessScope, status: WorkflowDefinitionStatus.PUBLISHED },
        { status: WorkflowDefinitionStatus.DRAFT },
      );
    }
    workflow.publishedDefinitionJson = JSON.parse(JSON.stringify(workflow.definitionJson)) as Record<string, unknown>;
    workflow.version = (workflow.version ?? 0) + 1;
    workflow.publishedAt = new Date();
    workflow.status = WorkflowDefinitionStatus.PUBLISHED;
    return this.workflowRepository.save(workflow);
  }

  async deactivate(id: string, businessScope: BusinessScope = BusinessScope.BEILUN): Promise<WorkflowDefinition> {
    const workflow = await this.get(id, businessScope);
    workflow.status = WorkflowDefinitionStatus.ARCHIVED;
    return this.workflowRepository.save(workflow);
  }

  async remove(id: string, businessScope: BusinessScope = BusinessScope.BEILUN): Promise<{ success: boolean; id: string }> {
    const workflow = await this.get(id, businessScope);
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

  private validateStatusTransitions(definition: Record<string, unknown>, flowKey: string | null): void {
    if (!flowKey) return;
    const transitions = definition.status_transitions;
    if (!transitions || typeof transitions !== 'object' || Array.isArray(transitions)) {
      throw new BadRequestException('在职流程必须配置状态流转规则');
    }

    const validStatuses = new Set<string>(Object.values(InServiceOrderStatus));
    for (const [source, targets] of Object.entries(transitions as Record<string, unknown>)) {
      if (!validStatuses.has(source) || !Array.isArray(targets)) {
        throw new BadRequestException(`在职流程状态 ${source} 配置不正确`);
      }
      if (targets.some((target) => typeof target !== 'string' || !validStatuses.has(target))) {
        throw new BadRequestException(`在职流程状态 ${source} 的下一状态配置不正确`);
      }
    }
  }

  private applyPatch(workflow: WorkflowDefinition, payload: UpdateWorkflowDto | PublishWorkflowDto): void {
    if (payload.name !== undefined) workflow.name = payload.name;
    const orderType = this.readOptionalOrderType(payload);
    if (orderType !== undefined) workflow.orderType = orderType;
    if (payload.description !== undefined) workflow.description = payload.description ?? null;
    if (payload.flowKey !== undefined) workflow.flowKey = this.normalizeFlowKey(payload.flowKey);
    const definitionJson = this.readOptionalDefinition(payload);
    if (definitionJson !== undefined) workflow.definitionJson = definitionJson;
    this.assertFlowIdentity(workflow.orderType, workflow.flowKey);
  }

  private readOrderType(payload: CreateWorkflowDto): WorkflowDefinition['orderType'] {
    return this.readOptionalOrderType(payload)
      ?? (this.readOptionalFlowKey(payload) ? null : this.failBadRequest('order_type or flow_key is required'));
  }

  private readOptionalOrderType(payload: WorkflowInput): WorkflowDefinition['orderType'] | undefined {
    return payload.orderType ?? payload.order_type;
  }

  private readOptionalFlowKey(payload: WorkflowInput): string | null {
    const raw = payload.flowKey?.trim();
    return raw ? this.normalizeFlowKey(raw) : null;
  }

  private normalizeFlowKey(value: string): string {
    const normalized = value.trim();
    if (!/^[a-z][a-z0-9_:-]{1,63}$/.test(normalized)) {
      throw new BadRequestException('flow_key 格式不正确');
    }
    return normalized;
  }

  private assertFlowIdentity(orderType: WorkflowDefinition['orderType'], flowKey: WorkflowDefinition['flowKey']): void {
    if (!orderType && !flowKey) {
      throw new BadRequestException('order_type or flow_key is required');
    }
    if (orderType && flowKey) {
      throw new BadRequestException('order_type 与 flow_key 不能同时设置');
    }
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
