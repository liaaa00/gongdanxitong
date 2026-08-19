import { DataSource } from 'typeorm';
import {
  BusinessScope,
  User,
  WorkflowDefinition,
  WorkflowDefinitionStatus,
} from 'src/entities';
import {
  IN_SERVICE_FLOW_KEYS,
  getDefaultInServiceFlowDefinition,
  getDefaultInServiceWorkflowSnapshot,
} from 'src/modules/in-service-orders/in-service-flow';

const BUSINESS_SCOPES = [
  BusinessScope.BEILUN,
  BusinessScope.OUT_OF_PROVINCE,
] as const;

export async function seedInServiceWorkflows(dataSource: DataSource): Promise<void> {
  const workflowRepository = dataSource.getRepository(WorkflowDefinition);
  const userRepository = dataSource.getRepository(User);
  const admin = await userRepository.findOne({ where: { username: 'lizhanbo', isActive: true } });
  if (!admin) return;

  for (const businessScope of BUSINESS_SCOPES) {
    for (const flowKey of IN_SERVICE_FLOW_KEYS) {
      const existing = await workflowRepository.findOne({
        where: { flowKey, businessScope },
      });
      if (existing) continue;

      const definition = getDefaultInServiceFlowDefinition(flowKey);
      const snapshot = getDefaultInServiceWorkflowSnapshot(flowKey);
      await workflowRepository.save(workflowRepository.create({
        name: definition.name,
        flowKey,
        orderType: null,
        businessScope,
        description: '在职独立直单流程；与其他在职业务分别维护。',
        definitionJson: snapshot,
        publishedDefinitionJson: snapshot,
        version: 1,
        publishedAt: new Date(),
        status: WorkflowDefinitionStatus.PUBLISHED,
        createdBy: admin.id,
      }));
    }
  }
}
