import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerPortalLifecycleMonitor20260910140000 implements MigrationInterface {
  name = 'AddCustomerPortalLifecycleMonitor20260910140000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE customer_portal_monitor_requests (
      id uuid PRIMARY KEY, request_key varchar(64) NOT NULL DEFAULT '', action varchar(48) NOT NULL,
      business_type varchar(16), customer_id uuid, account_id uuid,
      gateway_received_at timestamptz, connector_received_at timestamptz, backend_received_at timestamptz,
      backend_responded_at timestamptz, portal_responded_at timestamptz, timed_out_at timestamptz, failed_at timestamptz,
      failure_code varchar(40), backend_succeeded boolean,
      submission_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      returned_submission_ids jsonb NOT NULL DEFAULT '[]'::jsonb
    )`);
    await queryRunner.query(`CREATE INDEX idx_portal_monitor_received ON customer_portal_monitor_requests (gateway_received_at DESC)`);
    await queryRunner.query(`CREATE INDEX idx_portal_monitor_returned ON customer_portal_monitor_requests USING gin (returned_submission_ids)`);
    await queryRunner.query(`CREATE TABLE customer_portal_monitor_events (
      id uuid PRIMARY KEY, journal_id uuid NOT NULL, sequence bigint NOT NULL, trace_id uuid NOT NULL,
      stage varchar(32) NOT NULL, at timestamptz NOT NULL, failure_code varchar(40),
      UNIQUE (journal_id, sequence)
    )`);
    await queryRunner.query(`CREATE INDEX idx_portal_monitor_event_trace ON customer_portal_monitor_events (trace_id, at)`);
    await queryRunner.query(`CREATE TABLE customer_portal_monitor_connections (
      id uuid PRIMARY KEY, last_heartbeat_at timestamptz NOT NULL, connector_connected boolean NOT NULL
    )`);
    await queryRunner.query(`ALTER TABLE customer_portal_submissions ADD COLUMN monitor_trace_id uuid`);
    await queryRunner.query(`CREATE INDEX idx_portal_submission_monitor_trace ON customer_portal_submissions (monitor_trace_id)`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE customer_portal_submissions DROP COLUMN monitor_trace_id`);
    await queryRunner.query(`DROP TABLE customer_portal_monitor_connections`);
    await queryRunner.query(`DROP TABLE customer_portal_monitor_events`);
    await queryRunner.query(`DROP TABLE customer_portal_monitor_requests`);
  }
}
