import { MigrationInterface, QueryRunner } from 'typeorm';

export class OperationLogIndexes1716400000000 implements MigrationInterface {
  name = 'OperationLogIndexes1716400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_operation_logs_entity_entity_id_created_at ON operation_logs(entity_type, entity_id, created_at DESC)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at ON operation_logs(created_at DESC)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_operation_logs_user_id_created_at ON operation_logs(user_id, created_at DESC)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_operation_logs_user_id_created_at');
    await queryRunner.query('DROP INDEX IF EXISTS idx_operation_logs_created_at');
    await queryRunner.query('DROP INDEX IF EXISTS idx_operation_logs_entity_entity_id_created_at');
  }
}
