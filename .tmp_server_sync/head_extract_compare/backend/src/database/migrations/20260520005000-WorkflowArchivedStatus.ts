import { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkflowArchivedStatus20260520005000 implements MigrationInterface {
  name = 'WorkflowArchivedStatus20260520005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
            FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
           WHERE t.typname = 'workflow_definition_status_enum'
             AND e.enumlabel = 'archived'
        ) THEN
          ALTER TYPE workflow_definition_status_enum ADD VALUE 'archived';
        END IF;
      END $$;
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL enum value removal is intentionally not supported.
  }
}
