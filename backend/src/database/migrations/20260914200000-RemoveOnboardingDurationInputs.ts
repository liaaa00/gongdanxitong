import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveOnboardingDurationInputs20260914200000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE import_template_fields SET is_active = false
      WHERE order_type = 'onboarding' AND field_code IN ('contract_term', 'probation_months')`);
    // Keep global definitions and historical values for documents and renewal workflows.
  }

  async down(): Promise<void> {
    // Do not restore obsolete input requirements on application rollback.
  }
}
