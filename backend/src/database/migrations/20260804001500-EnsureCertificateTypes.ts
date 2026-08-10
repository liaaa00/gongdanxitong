import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnsureCertificateTypes20260804001500 implements MigrationInterface {
  name = 'EnsureCertificateTypes20260804001500';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('certificate_types')) return;

    await queryRunner.query(`
      CREATE TABLE certificate_types (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        template_url VARCHAR(500),
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Preserve configuration rows if this compatibility migration is reverted.
  }
}
