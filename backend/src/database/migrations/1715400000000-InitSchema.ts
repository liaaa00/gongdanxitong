import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1715400000000 implements MigrationInterface {
  name = 'InitSchema1715400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await queryRunner.query(
      "CREATE TYPE role_level_enum AS ENUM ('execution', 'supervisor', 'management', 'global')",
    );
    await queryRunner.query(
      "CREATE TYPE field_type_enum AS ENUM ('text', 'number', 'date', 'dropdown', 'email', 'phone')",
    );
    await queryRunner.query(
      "CREATE TYPE order_type_enum AS ENUM ('onboarding', 'renewal', 'resignation', 'benefit')",
    );
    await queryRunner.query(
      "CREATE TYPE field_permission_mode_enum AS ENUM ('visible', 'hidden', 'readonly', 'masked')",
    );
    await queryRunner.query(
      "CREATE TYPE dispatch_strategy_enum AS ENUM ('fixed', 'round_robin', 'load_balance', 'pool')",
    );
    await queryRunner.query(
      "CREATE TYPE work_order_status_enum AS ENUM ('draft', 'pending', 'processing', 'completed', 'returned', 'withdrawn')",
    );
    await queryRunner.query(
      "CREATE TYPE dispatched_order_status_enum AS ENUM ('pending', 'processing', 'completed', 'returned')",
    );
    await queryRunner.query(
      "CREATE TYPE withdraw_request_type_enum AS ENUM ('withdraw', 'modify')",
    );
    await queryRunner.query(
      "CREATE TYPE withdraw_request_status_enum AS ENUM ('pending', 'approved', 'rejected', 'partial')",
    );
    await queryRunner.query(
      "CREATE TYPE approval_status_enum AS ENUM ('pending', 'agree', 'reject')",
    );
    await queryRunner.query(
      "CREATE TYPE import_job_status_enum AS ENUM ('processing', 'completed', 'failed')",
    );

    await queryRunner.query(`
      CREATE TABLE departments (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        parent_id uuid NULL,
        code varchar(64) NOT NULL UNIQUE,
        name varchar(128) NOT NULL,
        sort_order integer NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_departments_parent FOREIGN KEY(parent_id) REFERENCES departments(id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        username varchar(64) NOT NULL UNIQUE,
        real_name varchar(128) NOT NULL,
        email varchar(128) UNIQUE,
        phone varchar(32),
        password_hash varchar(255) NOT NULL,
        avatar_url varchar(512),
        is_active boolean NOT NULL DEFAULT true,
        last_login_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE roles (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        code varchar(64) NOT NULL UNIQUE,
        name varchar(128) NOT NULL,
        level role_level_enum NOT NULL DEFAULT 'execution',
        description varchar(512),
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE user_roles (
        user_id uuid NOT NULL,
        role_id uuid NOT NULL,
        department_id uuid NOT NULL,
        is_primary boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(user_id, role_id, department_id),
        CONSTRAINT fk_user_roles_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_user_roles_role FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE CASCADE,
        CONSTRAINT fk_user_roles_department FOREIGN KEY(department_id) REFERENCES departments(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE customers (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        customer_code varchar(64) NOT NULL UNIQUE,
        customer_name varchar(128) NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE field_configs (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        field_code varchar(128) NOT NULL UNIQUE,
        field_name varchar(128) NOT NULL,
        field_type field_type_enum NOT NULL DEFAULT 'text',
        is_required boolean NOT NULL DEFAULT false,
        default_required boolean NOT NULL DEFAULT false,
        validation_regex varchar(512),
        validation_msg varchar(512),
        dropdown_options jsonb,
        placeholder varchar(255),
        help_text varchar(512),
        order_type order_type_enum,
        display_order integer NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE field_permissions (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        role_id uuid NOT NULL,
        field_code varchar(128) NOT NULL,
        permission field_permission_mode_enum NOT NULL DEFAULT 'visible',
        scenario varchar(128) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_field_permissions_role FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE CASCADE,
        CONSTRAINT uq_field_permissions_role_field_scenario UNIQUE(role_id, field_code, scenario)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE dispatch_rules (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        rule_name varchar(128) NOT NULL,
        order_type order_type_enum NOT NULL,
        trigger_conditions jsonb,
        target_module varchar(64) NOT NULL,
        dispatch_strategy dispatch_strategy_enum NOT NULL DEFAULT 'fixed',
        is_active boolean NOT NULL DEFAULT true,
        priority integer NOT NULL DEFAULT 100,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE module_handlers (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        module_code varchar(64) NOT NULL,
        handler_id uuid NOT NULL,
        weight integer NOT NULL DEFAULT 1,
        is_backup boolean NOT NULL DEFAULT false,
        is_active boolean NOT NULL DEFAULT true,
        CONSTRAINT fk_module_handlers_user FOREIGN KEY(handler_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE field_supplement_rules (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        field_code varchar(128) NOT NULL,
        supplementer_module varchar(64) NOT NULL,
        sync_to_modules jsonb,
        is_active boolean NOT NULL DEFAULT true
      )
    `);

    await queryRunner.query(`
      CREATE TABLE export_templates (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        template_name varchar(128) NOT NULL,
        module_code varchar(64) NOT NULL,
        field_list jsonb NOT NULL,
        created_by uuid,
        is_shared boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_export_templates_user FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE work_orders (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        order_no varchar(64) NOT NULL UNIQUE,
        order_type order_type_enum NOT NULL,
        status work_order_status_enum NOT NULL DEFAULT 'draft',
        created_by uuid NOT NULL,
        department_id uuid NOT NULL,
        customer_id uuid NOT NULL,
        employee_name varchar(128) NOT NULL,
        employee_id_card varchar(64) NOT NULL,
        extra_data jsonb NOT NULL DEFAULT '{}'::jsonb,
        submitted_at timestamptz,
        completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_work_orders_user FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT fk_work_orders_department FOREIGN KEY(department_id) REFERENCES departments(id) ON DELETE RESTRICT,
        CONSTRAINT fk_work_orders_customer FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE dispatched_orders (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        parent_order_id uuid NOT NULL,
        module_code varchar(64) NOT NULL,
        status dispatched_order_status_enum NOT NULL DEFAULT 'pending',
        handler_id uuid,
        visible_fields jsonb,
        return_reason varchar(512),
        dispatched_at timestamptz,
        accepted_at timestamptz,
        completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_dispatched_orders_work_order FOREIGN KEY(parent_order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
        CONSTRAINT fk_dispatched_orders_user FOREIGN KEY(handler_id) REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT uk_do_parent_module UNIQUE(parent_order_id, module_code)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE field_supplement_logs (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        work_order_id uuid NOT NULL,
        dispatched_order_id uuid NOT NULL,
        field_code varchar(128) NOT NULL,
        old_value text,
        new_value text,
        supplemented_by uuid NOT NULL,
        supplemented_at timestamptz NOT NULL,
        CONSTRAINT fk_supplement_logs_work_order FOREIGN KEY(work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
        CONSTRAINT fk_supplement_logs_dispatched_order FOREIGN KEY(dispatched_order_id) REFERENCES dispatched_orders(id) ON DELETE CASCADE,
        CONSTRAINT fk_supplement_logs_user FOREIGN KEY(supplemented_by) REFERENCES users(id) ON DELETE RESTRICT
      )
    `);

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

    await queryRunner.query(`
      CREATE TABLE operation_logs (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        entity_type varchar(64) NOT NULL,
        entity_id uuid NOT NULL,
        user_id uuid,
        action_type varchar(64) NOT NULL,
        before_data jsonb,
        after_data jsonb,
        ip_address varchar(64),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_operation_logs_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE import_jobs (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id uuid NOT NULL,
        file_path varchar(512) NOT NULL,
        total_rows integer NOT NULL DEFAULT 0,
        success_rows integer NOT NULL DEFAULT 0,
        fail_rows integer NOT NULL DEFAULT 0,
        field_mapping jsonb,
        status import_job_status_enum NOT NULL DEFAULT 'processing',
        error_report_url varchar(512),
        created_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz,
        CONSTRAINT fk_import_jobs_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE notifications (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id uuid NOT NULL,
        biz_type varchar(64) NOT NULL,
        title varchar(255) NOT NULL,
        content text NOT NULL,
        link varchar(512),
        payload jsonb,
        is_read boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        read_at timestamptz,
        CONSTRAINT fk_notifications_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS notifications');
    await queryRunner.query('DROP TABLE IF EXISTS import_jobs');
    await queryRunner.query('DROP TABLE IF EXISTS operation_logs');
    await queryRunner.query('DROP TABLE IF EXISTS withdraw_approvals');
    await queryRunner.query('DROP TABLE IF EXISTS withdraw_requests');
    await queryRunner.query('DROP TABLE IF EXISTS field_supplement_logs');
    await queryRunner.query('DROP TABLE IF EXISTS dispatched_orders');
    await queryRunner.query('DROP TABLE IF EXISTS work_orders');
    await queryRunner.query('DROP TABLE IF EXISTS export_templates');
    await queryRunner.query('DROP TABLE IF EXISTS field_supplement_rules');
    await queryRunner.query('DROP TABLE IF EXISTS module_handlers');
    await queryRunner.query('DROP TABLE IF EXISTS dispatch_rules');
    await queryRunner.query('DROP TABLE IF EXISTS field_permissions');
    await queryRunner.query('DROP TABLE IF EXISTS field_configs');
    await queryRunner.query('DROP TABLE IF EXISTS customers');
    await queryRunner.query('DROP TABLE IF EXISTS user_roles');
    await queryRunner.query('DROP TABLE IF EXISTS roles');
    await queryRunner.query('DROP TABLE IF EXISTS users');
    await queryRunner.query('DROP TABLE IF EXISTS departments');

    await queryRunner.query('DROP TYPE IF EXISTS import_job_status_enum');
    await queryRunner.query('DROP TYPE IF EXISTS approval_status_enum');
    await queryRunner.query('DROP TYPE IF EXISTS withdraw_request_status_enum');
    await queryRunner.query('DROP TYPE IF EXISTS withdraw_request_type_enum');
    await queryRunner.query('DROP TYPE IF EXISTS dispatched_order_status_enum');
    await queryRunner.query('DROP TYPE IF EXISTS work_order_status_enum');
    await queryRunner.query('DROP TYPE IF EXISTS dispatch_strategy_enum');
    await queryRunner.query('DROP TYPE IF EXISTS field_permission_mode_enum');
    await queryRunner.query('DROP TYPE IF EXISTS order_type_enum');
    await queryRunner.query('DROP TYPE IF EXISTS field_type_enum');
    await queryRunner.query('DROP TYPE IF EXISTS role_level_enum');
  }
}
