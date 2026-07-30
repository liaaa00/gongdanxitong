import { MigrationInterface, QueryRunner } from 'typeorm';

export class ModuleHandlerDelegations20260714002000 implements MigrationInterface {
  name = 'ModuleHandlerDelegations20260714002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS module_handler_delegations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        module_code varchar(64) NOT NULL,
        source_handler_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        delegate_handler_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        starts_at timestamptz NOT NULL,
        ends_at timestamptz NOT NULL,
        reason varchar(512) NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_module_handler_delegation_dates CHECK (ends_at > starts_at),
        CONSTRAINT chk_module_handler_delegation_people CHECK (delegate_handler_id IS NULL OR delegate_handler_id <> source_handler_id)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_module_handler_delegations_active_window ON module_handler_delegations(module_code, is_active, starts_at, ends_at)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_module_handler_delegations_source ON module_handler_delegations(source_handler_id, is_active)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS module_handler_delegations');
  }
}
