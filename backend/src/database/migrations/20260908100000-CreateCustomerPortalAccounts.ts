import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCustomerPortalAccounts20260908100000 implements MigrationInterface {
  name = 'CreateCustomerPortalAccounts20260908100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS customer_portal_accounts (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        login_email varchar(320) NOT NULL UNIQUE,
        contact_name varchar(100) NOT NULL,
        password_hash varchar(255) NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        must_change_password boolean NOT NULL DEFAULT false,
        last_login_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_customer_portal_accounts_customer ON customer_portal_accounts(customer_id, is_active)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_customer_portal_accounts_customer');
    await queryRunner.query('DROP TABLE IF EXISTS customer_portal_accounts');
  }
}
