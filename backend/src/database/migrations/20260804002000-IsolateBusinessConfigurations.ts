import { MigrationInterface, QueryRunner } from 'typeorm';

export class IsolateBusinessConfigurations20260804002000 implements MigrationInterface {
  name = 'IsolateBusinessConfigurations20260804002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'customers',
      'departments',
      'certificate_types',
      'branches',
      'customer_assignees',
      'module_fields',
      'module_handlers',
      'module_handler_delegations',
      'module_supervisors',
      'dispatch_rules',
      'exception_module_handlers',
      'action_configs',
      'field_permissions',
      'import_template_fields',
      'export_templates',
      'workflow_definitions',
    ];

    for (const table of tables) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS business_scope varchar(32) NOT NULL DEFAULT 'beilun'`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_${table}_business_scope" ON "${table}" (business_scope)`,
      );
    }

    const oldUniqueConstraints: Array<{ table: string; names: string[] }> = [
      { table: 'module_fields', names: ['uq_module_fields_module_field'] },
      { table: 'action_configs', names: ['uq_action_configs_module_action'] },
      { table: 'field_permissions', names: ['uq_field_permissions_role_field_scenario'] },
      { table: 'import_template_fields', names: ['uq_import_template_fields_order_field'] },
      { table: 'exception_module_handlers', names: ['uq_exception_module_handlers_module_customer'] },
      { table: 'customer_assignees', names: ['uq_customer_assignees_customer_user'] },
      { table: 'module_supervisors', names: ['uq_module_supervisors_module_user'] },
    ];
    for (const item of oldUniqueConstraints) {
      for (const name of item.names) {
        await queryRunner.query(`ALTER TABLE "${item.table}" DROP CONSTRAINT IF EXISTS "${name}"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "${name}"`);
      }
    }

    const certificateTypeNameColumn = await queryRunner.hasColumn('certificate_types', 'name')
      ? 'name'
      : await queryRunner.hasColumn('certificate_types', 'type_name')
        ? 'type_name'
        : 'display_name';
    const uniqueColumnIndexes: Array<{ table: string; columns: string[]; name: string }> = [
      { table: 'customers', columns: ['customer_code'], name: 'uq_customers_code_scope' },
      { table: 'departments', columns: ['code'], name: 'uq_departments_code_scope' },
      { table: 'certificate_types', columns: [certificateTypeNameColumn], name: 'uq_certificate_types_name_scope' },
      { table: 'branches', columns: ['branch_code'], name: 'uq_branches_code_scope' },
    ];
    const foreignKeyReferencedIndexes = await queryRunner.query(
      `SELECT i.relname AS indexname
       FROM pg_constraint c
       JOIN pg_class i ON i.oid = c.conindid
       WHERE c.contype = 'f' AND c.conindid <> 0`,
    ) as Array<{ indexname: string }>;
    const protectedIndexNames = new Set(foreignKeyReferencedIndexes.map((item) => item.indexname));

    for (const item of uniqueColumnIndexes) {
      const constraints = await queryRunner.query(
        `SELECT c.conname
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         WHERE t.relname = '${item.table}'
           AND c.contype = 'u'`,
      ) as Array<{ conname: string }>;
      for (const constraint of constraints) {
        if (protectedIndexNames.has(constraint.conname)) continue;
        await queryRunner.query(
          `ALTER TABLE "${item.table}" DROP CONSTRAINT IF EXISTS "${String(constraint.conname).replace(/"/g, '""')}"`,
        );
      }

      const indexes = await queryRunner.query(
        `SELECT indexname FROM pg_indexes
         WHERE schemaname = current_schema()
           AND tablename = '${item.table}'
           AND indexdef ILIKE 'CREATE UNIQUE%'
           AND indexdef ILIKE '%(${item.columns[0]})%'`,
      ) as Array<{ indexname: string }>;
      for (const index of indexes) {
        if (index.indexname !== item.name && !protectedIndexNames.has(index.indexname)) {
          await queryRunner.query(`DROP INDEX IF EXISTS "${String(index.indexname).replace(/"/g, '""')}"`);
        }
      }
      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "${item.name}" ON "${item.table}" (${item.columns.join(', ')}, business_scope)`,
      );
    }

    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "uq_module_fields_module_field_scope" ON "module_fields" (module_code, field_code, business_scope)',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "uq_action_configs_module_action_scope" ON "action_configs" (module_code, action_code, business_scope)',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "uq_field_permissions_role_field_scenario_scope" ON "field_permissions" (role_id, field_code, scenario, business_scope)',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "uq_import_template_fields_order_field_scope" ON "import_template_fields" (order_type, field_code, business_scope)',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "uq_exception_module_handlers_module_customer_scope" ON "exception_module_handlers" (module_code, customer_code, business_scope)',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "uq_customer_assignees_customer_user_scope" ON "customer_assignees" (customer_id, user_id, business_scope)',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "uq_module_supervisors_module_user_scope" ON "module_supervisors" (module_code, supervisor_id, business_scope)',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "uq_customer_assignees_customer_user_scope" ON "customer_assignees" (customer_id, user_id, business_scope)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'customers',
      'departments',
      'certificate_types',
      'branches',
      'customer_assignees',
      'module_fields',
      'module_handlers',
      'module_handler_delegations',
      'module_supervisors',
      'dispatch_rules',
      'exception_module_handlers',
      'action_configs',
      'field_permissions',
      'import_template_fields',
      'export_templates',
      'workflow_definitions',
    ];
    for (const table of tables) {
      await queryRunner.query(`DROP INDEX IF EXISTS "idx_${table}_business_scope"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS business_scope`);
    }
  }
}
