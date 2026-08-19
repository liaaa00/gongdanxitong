import { MigrationInterface, QueryRunner } from 'typeorm';
import { BusinessScope } from 'src/entities';
import {
  IN_SERVICE_FLOW_KEYS,
  InServiceFlowKey,
  getDefaultInServiceFlowDefinition,
  getDefaultInServiceWorkflowSnapshot,
} from 'src/modules/in-service-orders/in-service-flow';

const BUSINESS_SCOPES = [
  BusinessScope.BEILUN,
  BusinessScope.OUT_OF_PROVINCE,
] as const;

export class RepairInServiceWorkflowSnapshots20260817003000 implements MigrationInterface {
  name = 'RepairInServiceWorkflowSnapshots20260817003000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const creators = await queryRunner.query(`
      SELECT user_account.id
      FROM users user_account
      WHERE user_account.is_active = true
      ORDER BY EXISTS (
        SELECT 1
        FROM user_roles user_role
        INNER JOIN roles role ON role.id = user_role.role_id
        WHERE user_role.user_id = user_account.id
          AND role.code = 'admin'
          AND role.is_active = true
      ) DESC,
      user_account.created_at ASC
      LIMIT 1
    `) as Array<{ id: string }>;
    const createdBy = creators[0]?.id;
    if (!createdBy) return;

    const legacySnapshot = getDefaultInServiceWorkflowSnapshot('single_business');

    for (const businessScope of BUSINESS_SCOPES) {
      for (const flowKey of IN_SERVICE_FLOW_KEYS) {
        await this.insertMissing(queryRunner, flowKey, businessScope, createdBy);
        if (flowKey !== 'single_business') {
          await this.repairKnownLegacyCopy(queryRunner, flowKey, businessScope, legacySnapshot);
        }
      }
    }
  }

  private async insertMissing(
    queryRunner: QueryRunner,
    flowKey: InServiceFlowKey,
    businessScope: BusinessScope,
    createdBy: string,
  ): Promise<void> {
    const definition = getDefaultInServiceFlowDefinition(flowKey);
    const snapshot = getDefaultInServiceWorkflowSnapshot(flowKey);
    await queryRunner.query(
      `INSERT INTO workflow_definitions (
         name, order_type, business_scope, flow_key, description,
         definition_json, published_definition_json, version, published_at,
         status, created_by
       )
       VALUES ($1, NULL, $2, $3, $4, $5::jsonb, $5::jsonb, 1, now(), 'published', $6)
       ON CONFLICT (flow_key, business_scope) WHERE flow_key IS NOT NULL DO NOTHING`,
      [
        definition.name,
        businessScope,
        flowKey,
        '在职独立直单流程；与其他在职业务分别维护。',
        JSON.stringify(snapshot),
        createdBy,
      ],
    );
  }

  private async repairKnownLegacyCopy(
    queryRunner: QueryRunner,
    flowKey: InServiceFlowKey,
    businessScope: BusinessScope,
    legacySnapshot: Record<string, unknown>,
  ): Promise<void> {
    const definition = getDefaultInServiceFlowDefinition(flowKey);
    const snapshot = getDefaultInServiceWorkflowSnapshot(flowKey);
    await queryRunner.query(
      `UPDATE workflow_definitions
       SET name = $1,
           definition_json = $4::jsonb,
           published_definition_json = $4::jsonb,
           version = GREATEST(version, 1) + 1,
           published_at = now(),
           status = 'published',
           updated_at = now()
       WHERE flow_key = $2
         AND business_scope = $3
         AND (definition_json - 'flow_key') = ($5::jsonb - 'flow_key')
         AND (
           published_definition_json IS NULL
           OR (published_definition_json - 'flow_key') = ($5::jsonb - 'flow_key')
         )`,
      [
        definition.name,
        flowKey,
        businessScope,
        JSON.stringify(snapshot),
        JSON.stringify(legacySnapshot),
      ],
    );
  }

  async down(): Promise<void> {
    // Workflow snapshots are mutable business configuration; do not remove later legitimate changes.
  }
}
