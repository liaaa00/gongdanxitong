import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkflowFlowKey20260805002000 implements MigrationInterface {
  name = 'AddWorkflowFlowKey20260805002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "workflow_definitions" ADD COLUMN IF NOT EXISTS "flow_key" varchar(64)',
    );
    await queryRunner.query(
      'ALTER TABLE "workflow_definitions" ALTER COLUMN "order_type" DROP NOT NULL',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "idx_workflow_definitions_flow_key" ON "workflow_definitions" (flow_key)',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "uq_workflow_definitions_flow_scope" ON "workflow_definitions" (flow_key, business_scope) WHERE flow_key IS NOT NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "uq_workflow_definitions_flow_scope"');
    await queryRunner.query('DROP INDEX IF EXISTS "idx_workflow_definitions_flow_key"');
    await queryRunner.query('ALTER TABLE "workflow_definitions" DROP COLUMN IF EXISTS "flow_key"');
    await queryRunner.query('ALTER TABLE "workflow_definitions" ALTER COLUMN "order_type" SET NOT NULL');
  }
}
