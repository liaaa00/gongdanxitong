import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropWithdrawTables1716100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS withdraw_approvals');
    await queryRunner.query('DROP TABLE IF EXISTS withdraw_requests');
    await queryRunner.query('DROP TYPE IF EXISTS approval_status_enum');
    await queryRunner.query('DROP TYPE IF EXISTS withdraw_request_status_enum');
    await queryRunner.query('DROP TYPE IF EXISTS withdraw_request_type_enum');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "CREATE TYPE withdraw_request_type_enum AS ENUM ('withdraw', 'modify')",
    );
    await queryRunner.query(
      "CREATE TYPE withdraw_request_status_enum AS ENUM ('pending', 'approved', 'rejected', 'partial')",
    );
    await queryRunner.query(
      "CREATE TYPE approval_status_enum AS ENUM ('pending', 'agree', 'reject')",
    );

    await queryRunner.query(`
      CREATE TABLE withdraw_requests (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        work_order_id uuid NOT NULL,
        request_type withdraw_request_type_enum NOT NULL,
        modify_data jsonb,
        requester_id uuid NOT NULL,
        reason varchar(512) NOT NULL,
        status withdraw_request_status_enum NOT NULL DEFAULT 'pending',
        created_at timestamptz NOT NULL DEFAULT now(),
        resolved_at timestamptz,
        CONSTRAINT fk_withdraw_requests_work_order FOREIGN KEY(work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
        CONSTRAINT fk_withdraw_requests_user FOREIGN KEY(requester_id) REFERENCES users(id) ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE withdraw_approvals (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        withdraw_request_id uuid NOT NULL,
        dispatched_order_id uuid NOT NULL,
        approver_id uuid NOT NULL,
        approval_status approval_status_enum NOT NULL DEFAULT 'pending',
        reject_reason varchar(512),
        resolved_at timestamptz,
        CONSTRAINT fk_withdraw_approvals_request FOREIGN KEY(withdraw_request_id) REFERENCES withdraw_requests(id) ON DELETE CASCADE,
        CONSTRAINT fk_withdraw_approvals_dispatched FOREIGN KEY(dispatched_order_id) REFERENCES dispatched_orders(id) ON DELETE CASCADE,
        CONSTRAINT fk_withdraw_approvals_user FOREIGN KEY(approver_id) REFERENCES users(id) ON DELETE RESTRICT
      )
    `);
  }
}
