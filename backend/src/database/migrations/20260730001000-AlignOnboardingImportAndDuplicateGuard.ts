import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignOnboardingImportAndDuplicateGuard20260730001000 implements MigrationInterface {
  name = 'AlignOnboardingImportAndDuplicateGuard20260730001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_configs
      SET display_order = display_order + 3
      WHERE order_type = 'onboarding'::order_type_enum
        AND display_order > COALESCE(
          (SELECT display_order FROM field_configs WHERE field_code = 'education'),
          0
        )
        AND field_code NOT IN ('graduation_school', 'major', 'graduation_date')
    `);

    await queryRunner.query(`
      WITH field_seed(field_code, field_name, field_type, help_text, offset_no) AS (
        VALUES
          ('graduation_school', '毕业院校', 'text'::field_type_enum, '厦门社保增员时由客户填写或入职联系补充，学历材料通过附件上传。', 1),
          ('major', '专业', 'text'::field_type_enum, '厦门社保增员时由客户填写或入职联系补充。', 2),
          ('graduation_date', '毕业时间', 'date'::field_type_enum, '厦门社保增员时由客户填写或入职联系补充，标准格式：年-月-日。', 3)
      ),
      anchor AS (
        SELECT COALESCE(
          (SELECT display_order FROM field_configs WHERE field_code = 'education'),
          (SELECT COALESCE(MAX(display_order), 0) FROM field_configs WHERE order_type = 'onboarding'::order_type_enum)
        ) AS display_order
      )
      INSERT INTO field_configs (
        id, field_code, field_name, field_type, is_required, default_required,
        conditional_required, validation_regex, validation_msg, dropdown_options,
        collection_group, placeholder, help_text, order_type, business_context,
        display_order, is_active
      )
      SELECT
        uuid_generate_v4(), seed.field_code, seed.field_name, seed.field_type, false, false,
        NULL, NULL, NULL, NULL, '基本信息', NULL, seed.help_text,
        'onboarding'::order_type_enum, '["onboarding"]'::jsonb,
        anchor.display_order + seed.offset_no, true
      FROM field_seed seed
      CROSS JOIN anchor
      ON CONFLICT (field_code) DO UPDATE SET
        field_name = EXCLUDED.field_name,
        field_type = EXCLUDED.field_type,
        is_required = false,
        default_required = false,
        collection_group = EXCLUDED.collection_group,
        help_text = EXCLUDED.help_text,
        order_type = EXCLUDED.order_type,
        business_context = EXCLUDED.business_context,
        display_order = EXCLUDED.display_order,
        is_active = true
    `);

    await queryRunner.query(`
      UPDATE import_template_fields
      SET is_active = false, updated_at = now()
      WHERE order_type = 'onboarding'::order_type_enum
        AND field_code IN ('gender', 'birth_date', 'age')
    `);

    await queryRunner.query(`
      UPDATE import_template_fields
      SET display_order = display_order + 3, updated_at = now()
      WHERE order_type = 'onboarding'::order_type_enum
        AND display_order > COALESCE(
          (
            SELECT display_order
            FROM import_template_fields
            WHERE order_type = 'onboarding'::order_type_enum
              AND field_code = 'education'
          ),
          0
        )
        AND field_code NOT IN ('graduation_school', 'major', 'graduation_date')
    `);

    await queryRunner.query(`
      WITH template_seed(field_code, offset_no) AS (
        VALUES ('graduation_school', 1), ('major', 2), ('graduation_date', 3)
      ),
      anchor AS (
        SELECT COALESCE(
          (
            SELECT display_order
            FROM import_template_fields
            WHERE order_type = 'onboarding'::order_type_enum
              AND field_code = 'education'
          ),
          (
            SELECT COALESCE(MAX(display_order), 0)
            FROM import_template_fields
            WHERE order_type = 'onboarding'::order_type_enum
          )
        ) AS display_order
      )
      INSERT INTO import_template_fields (
        id, order_type, field_code, display_order, header_alias,
        is_required_override, is_active, created_at, updated_at
      )
      SELECT
        uuid_generate_v4(), 'onboarding'::order_type_enum, seed.field_code,
        anchor.display_order + seed.offset_no, NULL, false, true, now(), now()
      FROM template_seed seed
      CROSS JOIN anchor
      ON CONFLICT (order_type, field_code) DO UPDATE SET
        display_order = EXCLUDED.display_order,
        header_alias = NULL,
        is_required_override = false,
        is_active = true,
        updated_at = now()
    `);

    await queryRunner.query(`
      WITH module_field_seed(module_code, field_code) AS (
        VALUES
          ('onboarding_contact', 'education'),
          ('onboarding_contact', 'graduation_school'),
          ('onboarding_contact', 'major'),
          ('onboarding_contact', 'graduation_date'),
          ('data_entry', 'graduation_school'),
          ('data_entry', 'major'),
          ('data_entry', 'graduation_date'),
          ('social_insurance', 'education'),
          ('social_insurance', 'graduation_school'),
          ('social_insurance', 'major'),
          ('social_insurance', 'graduation_date')
      )
      INSERT INTO module_fields (
        id, module_code, field_code, group_name, display_order,
        is_required_override, is_active, created_at, updated_at
      )
      SELECT
        uuid_generate_v4(), seed.module_code, seed.field_code, '基本信息',
        field.display_order, NULL, true, now(), now()
      FROM module_field_seed seed
      INNER JOIN field_configs field ON field.field_code = seed.field_code
      INNER JOIN work_order_modules module ON module.module_code = seed.module_code
      ON CONFLICT (module_code, field_code) DO UPDATE SET
        group_name = EXCLUDED.group_name,
        display_order = EXCLUDED.display_order,
        is_active = true,
        updated_at = now()
    `);

    await queryRunner.query(`
      WITH fields(field_code) AS (
        VALUES ('education'), ('graduation_school'), ('major'), ('graduation_date')
      )
      INSERT INTO field_permissions (id, role_id, field_code, permission, scenario)
      SELECT
        uuid_generate_v4(),
        role.id,
        fields.field_code,
        (
          CASE
            WHEN role.code IN (
              'admin', 'business_owner', 'business_group_leader', 'business_group_member',
              'biz_manager', 'biz_leader', 'biz_member'
            ) THEN 'visible'
            ELSE 'readonly'
          END
        )::field_permission_mode_enum,
        'create:onboarding'
      FROM roles role
      CROSS JOIN fields
      WHERE role.code IN (
        'admin', 'business_owner', 'business_group_leader', 'business_group_member',
        'data_entry_leader', 'shared_team_owner', 'labor_contract_member',
        'onboarding_resignation_member', 'social_insurance_specialist',
        'biz_manager', 'biz_leader', 'biz_member', 'shared_leader',
        'contract_specialist', 'onboarding_specialist'
      )
      ON CONFLICT (role_id, field_code, scenario)
      DO UPDATE SET permission = EXCLUDED.permission
    `);

    await queryRunner.query(`
      WITH fields(field_code) AS (
        VALUES ('education'), ('graduation_school'), ('major'), ('graduation_date')
      )
      INSERT INTO field_permissions (id, role_id, field_code, permission, scenario)
      SELECT
        uuid_generate_v4(),
        role.id,
        fields.field_code,
        (
          CASE
            WHEN role.code IN (
              'admin', 'onboarding_resignation_member', 'shared_team_owner',
              'onboarding_specialist', 'shared_leader'
            ) THEN 'visible'
            ELSE 'readonly'
          END
        )::field_permission_mode_enum,
        'dispatched:onboarding_contact'
      FROM roles role
      CROSS JOIN fields
      WHERE role.code IN (
        'admin', 'onboarding_resignation_member', 'shared_team_owner',
        'onboarding_specialist', 'shared_leader',
        'business_owner', 'business_group_leader', 'biz_manager', 'biz_leader'
      )
      ON CONFLICT (role_id, field_code, scenario)
      DO UPDATE SET permission = EXCLUDED.permission
    `);

    await queryRunner.query(`
      WITH fields(field_code) AS (
        VALUES ('graduation_school'), ('major'), ('graduation_date')
      ),
      scenarios(scenario) AS (
        VALUES ('dispatched:data_entry'), ('dispatched:social_insurance')
      )
      INSERT INTO field_permissions (id, role_id, field_code, permission, scenario)
      SELECT
        uuid_generate_v4(),
        role.id,
        fields.field_code,
        (CASE WHEN role.code = 'admin' THEN 'visible' ELSE 'readonly' END)::field_permission_mode_enum,
        scenarios.scenario
      FROM roles role
      CROSS JOIN fields
      CROSS JOIN scenarios
      WHERE (
        scenarios.scenario = 'dispatched:data_entry'
        AND role.code IN ('admin', 'data_entry_leader', 'business_owner', 'business_group_leader', 'biz_manager', 'biz_leader')
      ) OR (
        scenarios.scenario = 'dispatched:social_insurance'
        AND role.code IN (
          'admin', 'social_insurance_specialist', 'data_entry_leader',
          'business_owner', 'business_group_leader', 'business_group_member',
          'biz_manager', 'biz_leader', 'biz_member'
        )
      )
      ON CONFLICT (role_id, field_code, scenario)
      DO UPDATE SET permission = EXCLUDED.permission
    `);

    await queryRunner.query(`
      WITH module_fields_to_add(module_code, fields) AS (
        VALUES
          ('onboarding_contact', '["education","graduation_school","major","graduation_date"]'::jsonb),
          ('data_entry', '["graduation_school","major","graduation_date"]'::jsonb),
          ('social_insurance', '["graduation_school","major","graduation_date"]'::jsonb)
      )
      UPDATE dispatched_orders orders
      SET visible_fields = (
        SELECT jsonb_agg(DISTINCT value)
        FROM jsonb_array_elements(
          COALESCE(orders.visible_fields, '[]'::jsonb) || module_fields_to_add.fields
        ) AS item(value)
      )
      FROM module_fields_to_add
      WHERE orders.module_code = module_fields_to_add.module_code
    `);

    await queryRunner.query(`
      WITH field_seed(module_code, field_code, field_name, offset_no) AS (
        VALUES
          ('onboarding_contact', 'education', '学历', 1),
          ('onboarding_contact', 'graduation_school', '毕业院校', 2),
          ('onboarding_contact', 'major', '专业', 3),
          ('onboarding_contact', 'graduation_date', '毕业时间', 4),
          ('data_entry', 'graduation_school', '毕业院校', 1),
          ('data_entry', 'major', '专业', 2),
          ('data_entry', 'graduation_date', '毕业时间', 3),
          ('social_insurance', 'education', '学历', 1),
          ('social_insurance', 'graduation_school', '毕业院校', 2),
          ('social_insurance', 'major', '专业', 3),
          ('social_insurance', 'graduation_date', '毕业时间', 4)
      )
      UPDATE export_templates template
      SET field_list = COALESCE(template.field_list, '[]'::jsonb) || COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'field_code', seed.field_code,
              'alias', seed.field_name,
              'title', seed.field_name,
              'header', jsonb_build_array(seed.field_name),
              'order', COALESCE(
                (
                  SELECT MAX(
                    CASE
                      WHEN item->>'order' ~ '^[0-9]+$' THEN (item->>'order')::integer
                      ELSE 0
                    END
                  )
                  FROM jsonb_array_elements(COALESCE(template.field_list, '[]'::jsonb)) item
                ),
                0
              ) + seed.offset_no
            )
            ORDER BY seed.offset_no
          )
          FROM field_seed seed
          WHERE seed.module_code = template.module_code
            AND NOT EXISTS (
              SELECT 1
              FROM jsonb_array_elements(COALESCE(template.field_list, '[]'::jsonb)) item
              WHERE COALESCE(item->>'field_code', item->>'fieldCode') = seed.field_code
            )
        ),
        '[]'::jsonb
      )
      WHERE template.is_shared = true
        AND template.module_code IN ('onboarding_contact', 'data_entry', 'social_insurance')
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_duplicate_active_employee_order()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      DECLARE
        conflict_order_no varchar(64);
      BEGIN
        IF NEW.employee_id_card IS NULL OR btrim(NEW.employee_id_card) = '' THEN
          RETURN NEW;
        END IF;
        IF NEW.order_type::text NOT IN ('onboarding', 'resignation') THEN
          RETURN NEW;
        END IF;
        IF NEW.status::text IN ('withdrawn', 'void') THEN
          RETURN NEW;
        END IF;
        IF TG_OP = 'UPDATE'
          AND OLD.order_type = NEW.order_type
          AND OLD.employee_id_card = NEW.employee_id_card
          AND OLD.created_at = NEW.created_at
          AND OLD.status::text NOT IN ('withdrawn', 'void')
        THEN
          RETURN NEW;
        END IF;

        PERFORM pg_advisory_xact_lock(
          hashtextextended(
            'work-order-duplicate:' || NEW.order_type::text || ':' || NEW.employee_id_card,
            0
          )
        );

        SELECT existing.order_no
        INTO conflict_order_no
        FROM work_orders existing
        WHERE existing.id <> NEW.id
          AND existing.order_type = NEW.order_type
          AND existing.employee_id_card = NEW.employee_id_card
          AND existing.status::text NOT IN ('withdrawn', 'void')
          AND (
            NEW.order_type::text = 'onboarding'
            OR date_trunc('month', existing.created_at AT TIME ZONE 'UTC')
              = date_trunc('month', NEW.created_at AT TIME ZONE 'UTC')
          )
        ORDER BY existing.created_at DESC
        LIMIT 1;

        IF conflict_order_no IS NOT NULL THEN
          RAISE EXCEPTION 'duplicate employee identity for active work order'
            USING
              ERRCODE = '23505',
              CONSTRAINT = 'uq_work_orders_idcard_guard',
              DETAIL = 'conflict order: ' || conflict_order_no;
        END IF;
        RETURN NEW;
      END;
      $$
    `);

    await queryRunner.query('DROP TRIGGER IF EXISTS trg_prevent_duplicate_active_employee_order ON work_orders');
    await queryRunner.query(`
      CREATE TRIGGER trg_prevent_duplicate_active_employee_order
      BEFORE INSERT OR UPDATE OF order_type, employee_id_card, status, created_at
      ON work_orders
      FOR EACH ROW
      EXECUTE FUNCTION prevent_duplicate_active_employee_order()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_prevent_duplicate_active_employee_order ON work_orders');
    await queryRunner.query('DROP FUNCTION IF EXISTS prevent_duplicate_active_employee_order');

    await queryRunner.query(`
      UPDATE dispatched_orders
      SET visible_fields = COALESCE(visible_fields, '[]'::jsonb)
        - 'graduation_school' - 'major' - 'graduation_date'
      WHERE module_code IN ('onboarding_contact', 'data_entry', 'social_insurance')
    `);

    await queryRunner.query(`
      UPDATE export_templates template
      SET field_list = COALESCE(
        (
          SELECT jsonb_agg(item.value ORDER BY item.ordinality)
          FROM jsonb_array_elements(COALESCE(template.field_list, '[]'::jsonb))
            WITH ORDINALITY AS item(value, ordinality)
          WHERE COALESCE(item.value->>'field_code', item.value->>'fieldCode')
            NOT IN ('graduation_school', 'major', 'graduation_date')
        ),
        '[]'::jsonb
      )
      WHERE template.module_code IN ('onboarding_contact', 'data_entry', 'social_insurance')
    `);

    await queryRunner.query(`
      DELETE FROM field_permissions
      WHERE field_code IN ('graduation_school', 'major', 'graduation_date')
    `);
    await queryRunner.query(`
      DELETE FROM module_fields
      WHERE field_code IN ('graduation_school', 'major', 'graduation_date')
    `);
    await queryRunner.query(`
      DELETE FROM import_template_fields
      WHERE order_type = 'onboarding'::order_type_enum
        AND field_code IN ('graduation_school', 'major', 'graduation_date')
    `);
    await queryRunner.query(`
      UPDATE import_template_fields
      SET is_active = true, updated_at = now()
      WHERE order_type = 'onboarding'::order_type_enum
        AND field_code IN ('gender', 'birth_date', 'age')
    `);
    await queryRunner.query(`
      DELETE FROM field_configs
      WHERE field_code IN ('graduation_school', 'major', 'graduation_date')
    `);
  }
}
