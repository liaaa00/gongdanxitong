import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWorkflowDefinitions20260520003000 implements MigrationInterface {
  name = 'CreateWorkflowDefinitions20260520003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE workflow_definition_status_enum AS ENUM ('draft', 'published')`);
    await queryRunner.query(`
      CREATE TABLE workflow_definitions (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        name varchar(128) NOT NULL,
        order_type order_type_enum NOT NULL,
        description varchar(512),
        definition_json jsonb NOT NULL,
        status workflow_definition_status_enum NOT NULL DEFAULT 'draft',
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_workflow_definitions_created_by FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_workflow_definitions_order_type ON workflow_definitions(order_type)`);
    await queryRunner.query(`CREATE INDEX idx_workflow_definitions_status ON workflow_definitions(status)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_workflow_definitions_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_workflow_definitions_order_type`);
    await queryRunner.query(`DROP TABLE IF EXISTS workflow_definitions`);
    await queryRunner.query(`DROP TYPE IF EXISTS workflow_definition_status_enum`);
  }
}
