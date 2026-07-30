import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuthSessionSecurity20260714001000 implements MigrationInterface {
  name = 'AuthSessionSecurity20260714001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version integer NOT NULL DEFAULT 0',
    );
    await queryRunner.query(
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts integer NOT NULL DEFAULT 0',
    );
    await queryRunner.query(
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until timestamptz NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE users DROP COLUMN IF EXISTS locked_until');
    await queryRunner.query('ALTER TABLE users DROP COLUMN IF EXISTS failed_login_attempts');
    await queryRunner.query('ALTER TABLE users DROP COLUMN IF EXISTS auth_version');
  }
}
