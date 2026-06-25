import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase4ImportJobs1715600000000 implements MigrationInterface {
  name = 'Phase4ImportJobs1715600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE import_job_status_enum ADD VALUE IF NOT EXISTS 'partial'`);
    await queryRunner.query(`ALTER TYPE import_job_status_enum ADD VALUE IF NOT EXISTS 'cancelled'`);
    await queryRunner.query(`ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS ai_model_used varchar(128)`);
    await queryRunner.query(`ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS ai_prompt_hash varchar(128)`);
    await queryRunner.query(`ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS ai_mapping_raw jsonb`);
    await queryRunner.query(`ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS ai_fallback_reason varchar(64)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE import_jobs DROP COLUMN IF EXISTS ai_fallback_reason`);
    await queryRunner.query(`ALTER TABLE import_jobs DROP COLUMN IF EXISTS ai_mapping_raw`);
    await queryRunner.query(`ALTER TABLE import_jobs DROP COLUMN IF EXISTS ai_prompt_hash`);
    await queryRunner.query(`ALTER TABLE import_jobs DROP COLUMN IF EXISTS ai_model_used`);
  }
}
