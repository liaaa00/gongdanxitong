import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillOutOfProvinceBusinessScope20260804003000 implements MigrationInterface {
  name = 'BackfillOutOfProvinceBusinessScope20260804003000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO departments (code, name, parent_id, sort_order, is_active, business_scope)
       SELECT code, name, NULL, sort_order, is_active, 'out_of_province'
       FROM departments
       WHERE code = 'WELFARE_SECURITY' AND business_scope = 'beilun'
       ON CONFLICT (code, business_scope) DO NOTHING`,
    );

    await queryRunner.query(
      `UPDATE user_roles ur
       SET department_id = out_department.id
       FROM users u, departments out_department
       WHERE ur.user_id = u.id
         AND u.business_scope = 'out_of_province'
         AND out_department.business_scope = 'out_of_province'
         AND out_department.code = (
           SELECT current_department.code
           FROM departments current_department
           WHERE current_department.id = ur.department_id
         )`,
    );

    await queryRunner.query(
      `UPDATE module_handlers handler
       SET business_scope = 'out_of_province'
       FROM users user_row
       WHERE handler.handler_id = user_row.id
         AND user_row.business_scope = 'out_of_province'`,
    );

    await queryRunner.query(
      `UPDATE module_handler_delegations delegation
       SET business_scope = 'out_of_province'
       FROM users source_user
       WHERE delegation.source_handler_id = source_user.id
         AND source_user.business_scope = 'out_of_province'`,
    );
    await queryRunner.query(
      `UPDATE module_handler_delegations delegation
       SET business_scope = 'out_of_province'
       FROM users delegate_user
       WHERE delegation.delegate_handler_id = delegate_user.id
         AND delegate_user.business_scope = 'out_of_province'`,
    );

    await queryRunner.query(
      `UPDATE exception_module_handlers exception_row
       SET business_scope = 'out_of_province'
       FROM users user_row
       WHERE exception_row.handler_id = user_row.id
         AND user_row.business_scope = 'out_of_province'`,
    );

    await queryRunner.query(
      `UPDATE module_fields
       SET business_scope = 'out_of_province'
       WHERE module_code LIKE 'out_of_province_%'`,
    );
    await queryRunner.query(
      `UPDATE action_configs
       SET business_scope = 'out_of_province'
       WHERE module_code LIKE 'out_of_province_%'`,
    );
    await queryRunner.query(
      `UPDATE module_supervisors
       SET business_scope = 'out_of_province'
       WHERE module_code LIKE 'out_of_province_%'`,
    );
    await queryRunner.query(
      `UPDATE dispatch_rules
       SET business_scope = 'out_of_province'
       WHERE order_type::text IN ('out_of_province_increase', 'out_of_province_decrease')`,
    );

    await queryRunner.query(
      `INSERT INTO field_permissions (role_id, field_code, scenario, permission, business_scope)
       SELECT role_id, field_code, scenario, permission, 'out_of_province'
       FROM field_permissions
       WHERE business_scope = 'beilun'
       ON CONFLICT (role_id, field_code, scenario, business_scope) DO NOTHING`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM field_permissions WHERE business_scope = 'out_of_province'`,
    );
    await queryRunner.query(
      `UPDATE dispatch_rules
       SET business_scope = 'beilun'
       WHERE order_type::text IN ('out_of_province_increase', 'out_of_province_decrease')`,
    );
    await queryRunner.query(
      `UPDATE module_supervisors SET business_scope = 'beilun' WHERE module_code LIKE 'out_of_province_%'`,
    );
    await queryRunner.query(
      `UPDATE action_configs SET business_scope = 'beilun' WHERE module_code LIKE 'out_of_province_%'`,
    );
    await queryRunner.query(
      `UPDATE module_fields SET business_scope = 'beilun' WHERE module_code LIKE 'out_of_province_%'`,
    );
    await queryRunner.query(
      `UPDATE exception_module_handlers SET business_scope = 'beilun' WHERE business_scope = 'out_of_province'`,
    );
    await queryRunner.query(
      `UPDATE module_handler_delegations SET business_scope = 'beilun' WHERE business_scope = 'out_of_province'`,
    );
    await queryRunner.query(
      `UPDATE module_handlers SET business_scope = 'beilun' WHERE business_scope = 'out_of_province'`,
    );
    await queryRunner.query(
      `UPDATE user_roles ur
       SET department_id = current_department.id
       FROM users u, departments current_department
       WHERE ur.user_id = u.id
         AND u.business_scope = 'out_of_province'
         AND current_department.business_scope = 'beilun'
         AND current_department.code = (
           SELECT out_department.code
           FROM departments out_department
           WHERE out_department.id = ur.department_id
         )`,
    );
    await queryRunner.query(
      `DELETE FROM departments WHERE code = 'WELFARE_SECURITY' AND business_scope = 'out_of_province'`,
    );
  }
}
