import { DataSource } from 'typeorm';
import {
  BusinessScope,
  User,
  WorkflowDefinition,
  WorkflowDefinitionStatus,
} from 'src/entities';
import {
  IN_SERVICE_FLOW_KEYS,
  InServiceFlowKey,
  getDefaultInServiceFlowDefinition,
} from 'src/modules/in-service-orders/in-service-flow';

const FLOW_GRAPHS: Record<InServiceFlowKey, {
  nodes: Array<Record<string, string>>;
  edges: Array<Record<string, string>>;
}> = {
  single_business: {
    nodes: [
      { id: 'start', type: 'start', label: '开始' },
      { id: 'accepted', type: 'process', label: '受理与资料初审' },
      { id: 'processing', type: 'process', label: '业务办理' },
      { id: 'end', type: 'end', label: '办理结果' },
    ],
    edges: [
      { id: 'start-accepted', source: 'start', target: 'accepted' },
      { id: 'accepted-processing', source: 'accepted', target: 'processing' },
      { id: 'processing-end', source: 'processing', target: 'end' },
    ],
  },
  contract_renewal: {
    nodes: [
      { id: 'start', type: 'start', label: '未接单' },
      { id: 'accepted', type: 'process', label: '已接单' },
      { id: 'end', type: 'end', label: '已完成' },
    ],
    edges: [
      { id: 'start-accepted', source: 'start', target: 'accepted' },
      { id: 'accepted-end', source: 'accepted', target: 'end' },
    ],
  },
  certificate: {
    nodes: [
      { id: 'start', type: 'start', label: '待开具' },
      { id: 'processing', type: 'process', label: '开具中' },
      { id: 'end', type: 'end', label: '已完成' },
    ],
    edges: [
      { id: 'start-processing', source: 'start', target: 'processing' },
      { id: 'processing-end', source: 'processing', target: 'end' },
    ],
  },
};

function toDefinitionJson(flowKey: (typeof IN_SERVICE_FLOW_KEYS)[number]): Record<string, unknown> {
  const definition = getDefaultInServiceFlowDefinition(flowKey);
  return {
    flow_key: definition.flow_key,
    status_transitions: definition.status_transitions,
    ...FLOW_GRAPHS[flowKey],
  };
}

export async function seedInServiceWorkflows(dataSource: DataSource): Promise<void> {
  const workflowRepository = dataSource.getRepository(WorkflowDefinition);
  const userRepository = dataSource.getRepository(User);
  const admin = await userRepository.findOne({ where: { username: 'lizhanbo', isActive: true } });
  if (!admin) return;

  for (const flowKey of IN_SERVICE_FLOW_KEYS) {
    const existing = await workflowRepository.findOne({
      where: { flowKey, businessScope: BusinessScope.BEILUN },
    });
    if (existing) continue;

    const definition = getDefaultInServiceFlowDefinition(flowKey);
    await workflowRepository.save(workflowRepository.create({
      name: definition.name,
      flowKey,
      orderType: null,
      businessScope: BusinessScope.BEILUN,
      description: '在职独立直单流程；与其他在职业务分别维护。',
      definitionJson: toDefinitionJson(flowKey),
      publishedDefinitionJson: toDefinitionJson(flowKey),
      version: 1,
      publishedAt: new Date(),
      status: WorkflowDefinitionStatus.PUBLISHED,
      createdBy: admin.id,
    }));
  }
}
