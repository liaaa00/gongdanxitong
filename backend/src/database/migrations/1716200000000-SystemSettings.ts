import { MigrationInterface, QueryRunner } from 'typeorm';

export class SystemSettings1716200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key varchar(64) PRIMARY KEY,
        value text NOT NULL,
        is_encrypted boolean NOT NULL DEFAULT false,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS system_settings');
  }
}
