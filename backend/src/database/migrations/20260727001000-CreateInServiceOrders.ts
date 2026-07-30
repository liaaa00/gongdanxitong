import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableCheck,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateInServiceOrders20260727001000 implements MigrationInterface {
  name = 'CreateInServiceOrders20260727001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('in_service_orders')) return;

    await queryRunner.createTable(new Table({
      name: 'in_service_orders',
      columns: [
        { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'gen_random_uuid()' },
        { name: 'order_no', type: 'varchar', length: '40', isNullable: false, isUnique: true },
        { name: 'order_type', type: 'varchar', length: '32', isNullable: false, default: "'in_service'" },
        { name: 'customer_id', type: 'uuid', isNullable: false },
        { name: 'department_id', type: 'uuid', isNullable: false },
        { name: 'business_type', type: 'varchar', length: '64', isNullable: false },
        { name: 'process_type', type: 'varchar', length: '64', isNullable: false },
        { name: 'requirement_type', type: 'varchar', length: '64', isNullable: false },
        { name: 'province', type: 'varchar', length: '20', isNullable: false },
        { name: 'contact_phone', type: 'varchar', length: '32', isNullable: false },
        { name: 'business_description', type: 'text', isNullable: false },
        { name: 'service_fee', type: 'numeric', precision: 12, scale: 2, isNullable: false },
        { name: 'handle_channel', type: 'varchar', length: '16', isNullable: false, default: "'online'" },
        { name: 'attachments', type: 'jsonb', isNullable: false, default: "'[]'::jsonb" },
        { name: 'status', type: 'varchar', length: '32', isNullable: false, default: "'draft'" },
        { name: 'handler_id', type: 'uuid', isNullable: true },
        { name: 'created_by', type: 'uuid', isNullable: false },
        { name: 'approved_by', type: 'uuid', isNullable: true },
        { name: 'rejected_by', type: 'uuid', isNullable: true },
        { name: 'closed_by', type: 'uuid', isNullable: true },
        { name: 'rejection_reason', type: 'varchar', length: '512', isNullable: true },
        { name: 'pending_info_reason', type: 'varchar', length: '512', isNullable: true },
        { name: 'completion_remark', type: 'varchar', length: '512', isNullable: true },
        { name: 'close_reason', type: 'varchar', length: '512', isNullable: true },
        { name: 'approved_at', type: 'timestamptz', isNullable: true },
        { name: 'rejected_at', type: 'timestamptz', isNullable: true },
        { name: 'dispatched_at', type: 'timestamptz', isNullable: true },
        { name: 'processing_at', type: 'timestamptz', isNullable: true },
        { name: 'pending_info_at', type: 'timestamptz', isNullable: true },
        { name: 'completed_at', type: 'timestamptz', isNullable: true },
        { name: 'closed_at', type: 'timestamptz', isNullable: true },
        { name: 'created_at', type: 'timestamptz', isNullable: false, default: 'now()' },
        { name: 'updated_at', type: 'timestamptz', isNullable: false, default: 'now()' },
        { name: 'deleted_at', type: 'timestamptz', isNullable: true },
        { name: 'version', type: 'integer', isNullable: false, default: '1' },
      ],
      checks: [
        new TableCheck({
          name: 'chk_in_service_orders_order_type',
          expression: "order_type = 'in_service'",
        }),
        new TableCheck({
          name: 'chk_in_service_orders_status',
          expression: "status IN ('draft','dispatched','processing','pending_info','completed','archived')",
        }),
        new TableCheck({
          name: 'chk_in_service_orders_handle_channel',
          expression: "handle_channel IN ('online','offline')",
        }),
        new TableCheck({
          name: 'chk_in_service_orders_service_fee',
          expression: 'service_fee >= 0',
        }),
      ],
      foreignKeys: [
        new TableForeignKey({
          name: 'fk_in_service_orders_customer',
          columnNames: ['customer_id'],
          referencedTableName: 'customers',
          referencedColumnNames: ['id'],
          onDelete: 'RESTRICT',
        }),
        new TableForeignKey({
          name: 'fk_in_service_orders_department',
          columnNames: ['department_id'],
          referencedTableName: 'departments',
          referencedColumnNames: ['id'],
          onDelete: 'RESTRICT',
        }),
        new TableForeignKey({
          name: 'fk_in_service_orders_creator',
          columnNames: ['created_by'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'RESTRICT',
        }),
        new TableForeignKey({
          name: 'fk_in_service_orders_handler',
          columnNames: ['handler_id'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
        new TableForeignKey({
          name: 'fk_in_service_orders_approved_by',
          columnNames: ['approved_by'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
        new TableForeignKey({
          name: 'fk_in_service_orders_rejected_by',
          columnNames: ['rejected_by'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
        new TableForeignKey({
          name: 'fk_in_service_orders_closed_by',
          columnNames: ['closed_by'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      ],
    }), true);

    for (const index of [
      new TableIndex({ name: 'idx_in_service_orders_status', columnNames: ['status'] }),
      new TableIndex({ name: 'idx_in_service_orders_creator', columnNames: ['created_by'] }),
      new TableIndex({ name: 'idx_in_service_orders_handler', columnNames: ['handler_id'] }),
      new TableIndex({ name: 'idx_in_service_orders_customer', columnNames: ['customer_id'] }),
      new TableIndex({ name: 'idx_in_service_orders_province', columnNames: ['province'] }),
    ]) {
      await queryRunner.createIndex('in_service_orders', index);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('in_service_orders')) {
      await queryRunner.dropTable('in_service_orders', true);
    }
  }
}
