import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefineContractTemplateFields20260827001000 implements MigrationInterface {
  name = 'RefineContractTemplateFields20260827001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO field_configs (
        field_code, field_name, field_type, is_required, default_required,
        conditional_required, help_text, order_type, business_context,
        collection_group, display_order, is_active, is_included_in_template, created_at
      )
      VALUES (
        'special_contract_template_name', '特殊合同模板名称', 'text', false, false,
        '{"op":"AND","children":[{"op":"EQ","field":"need_company_contract","value":"是"},{"op":"EQ","field":"contract_template","value":"特殊模板"}]}'::jsonb,
        '选择特殊模板时填写具体模板名称。', 'onboarding', '["onboarding"]'::jsonb,
        '劳动合同新签',
        COALESCE((SELECT display_order + 1 FROM field_configs WHERE field_code = 'contract_template'), 0),
        true, true, now()
      )
      ON CONFLICT (field_code) DO UPDATE SET
        field_name = EXCLUDED.field_name,
        field_type = EXCLUDED.field_type,
        conditional_required = EXCLUDED.conditional_required,
        help_text = EXCLUDED.help_text,
        order_type = EXCLUDED.order_type,
        business_context = EXCLUDED.business_context,
        collection_group = EXCLUDED.collection_group,
        is_active = true,
        is_included_in_template = true
    `);

    await queryRunner.query(`
      UPDATE field_configs
         SET is_active = false, is_included_in_template = false
       WHERE field_code = 'paper_contract_template'
    `);

    await queryRunner.query(`
      UPDATE module_fields
         SET is_active = false, updated_at = now()
       WHERE field_code = 'paper_contract_template'
    `);
    await queryRunner.query(`
      WITH scopes(business_scope) AS (VALUES ('beilun'), ('out_of_province'))
      INSERT INTO module_fields (
        module_code, business_scope, field_code, group_name, display_order,
        is_required_override, is_active, created_at, updated_at
      )
      SELECT
        'contract', scopes.business_scope, 'special_contract_template_name', '合同信息',
        COALESCE((SELECT display_order + 1 FROM module_fields
                   WHERE module_code = 'contract'
                     AND business_scope = scopes.business_scope
                     AND field_code = 'contract_template'), 0),
        false, true, now(), now()
      FROM scopes
      WHERE EXISTS (SELECT 1 FROM work_order_modules WHERE module_code = 'contract')
      ON CONFLICT (module_code, field_code, business_scope) DO UPDATE
        SET group_name = EXCLUDED.group_name,
            is_required_override = false,
            is_active = true,
            updated_at = now()
    `);

    await queryRunner.query(`
      UPDATE import_template_fields
         SET is_active = false, updated_at = now()
       WHERE field_code = 'paper_contract_template'
    `);
    await queryRunner.query(`
      INSERT INTO import_template_fields (
        order_type, field_code, display_order, header_alias,
        is_required_override, is_active, business_scope, created_at, updated_at
      )
      SELECT
        'onboarding', 'special_contract_template_name', source.display_order + 1,
        '特殊合同模板名称', NULL, true, source.business_scope, now(), now()
      FROM import_template_fields source
      WHERE source.order_type = 'onboarding'
        AND source.field_code = 'contract_template'
        AND NOT EXISTS (
          SELECT 1 FROM import_template_fields existing
           WHERE existing.order_type = 'onboarding'
             AND existing.field_code = 'special_contract_template_name'
             AND existing.business_scope = source.business_scope
        )
      ON CONFLICT (order_type, field_code, business_scope) DO UPDATE
        SET header_alias = EXCLUDED.header_alias,
            is_active = true,
            updated_at = now()
    `);

    await queryRunner.query(`
      WITH scopes(business_scope) AS (VALUES ('beilun'), ('out_of_province')),
           role_codes(role_code) AS (
             VALUES
               ('admin'), ('labor_contract_member'), ('contract_specialist'),
               ('contract_team'), ('shared_team_owner'), ('shared_leader'),
               ('business_owner'), ('business_group_leader'), ('biz_manager'),
               ('biz_leader'), ('business_group_member'), ('biz_member')
           )
      INSERT INTO field_permissions (
        role_id, field_code, permission, scenario, business_scope, created_at
      )
      SELECT
        role.id,
        'special_contract_template_name',
        CASE
          WHEN role_codes.role_code IN (
            'admin', 'labor_contract_member', 'contract_specialist',
            'contract_team', 'shared_team_owner', 'shared_leader',
            'business_group_member', 'biz_member'
          ) THEN 'visible'
          WHEN role_codes.role_code IN (
            'business_owner', 'business_group_leader', 'biz_manager', 'biz_leader'
          ) THEN 'readonly'
          ELSE 'hidden'
        END::field_permission_mode_enum,
        'dispatched:contract', scopes.business_scope, now()
      FROM scopes
      CROSS JOIN role_codes
      INNER JOIN roles role ON role.code = role_codes.role_code
      ON CONFLICT (role_id, field_code, scenario, business_scope) DO UPDATE
        SET permission = EXCLUDED.permission
    `);

    await queryRunner.query(`
      UPDATE field_supplement_rules
         SET is_active = false
       WHERE field_code = 'paper_contract_template'
    `);
    await queryRunner.query(`
      INSERT INTO field_supplement_rules (field_code, supplementer_module, sync_to_modules, is_active)
      SELECT 'special_contract_template_name', 'contract', NULL, true
      WHERE NOT EXISTS (
        SELECT 1 FROM field_supplement_rules
         WHERE field_code = 'special_contract_template_name'
           AND supplementer_module = 'contract'
      )
    `);

    await queryRunner.query(`
      UPDATE detail_view_templates template
         SET field_list = COALESCE((
           SELECT jsonb_agg(item ORDER BY ord)
             FROM jsonb_array_elements(COALESCE(template.field_list, '[]'::jsonb))
                  WITH ORDINALITY AS elements(item, ord)
            WHERE COALESCE(item->>'fieldCode', item->>'field_code') <> 'paper_contract_template'
         ), '[]'::jsonb),
             updated_at = now()
       WHERE template.module_code = 'contract'
         AND template.is_active = true
    `);
    await queryRunner.query(`
      UPDATE detail_view_templates template
         SET field_list = COALESCE(template.field_list, '[]'::jsonb)
                        || '[{"fieldCode":"special_contract_template_name","kind":"field"}]'::jsonb,
             updated_at = now()
       WHERE template.module_code = 'contract'
         AND template.is_active = true
         AND NOT EXISTS (
           SELECT 1
             FROM jsonb_array_elements(COALESCE(template.field_list, '[]'::jsonb)) item
            WHERE COALESCE(item->>'fieldCode', item->>'field_code') = 'special_contract_template_name'
         )
    `);

    await queryRunner.query(`
      UPDATE dispatched_orders
         SET visible_fields = (COALESCE(visible_fields, '[]'::jsonb) - 'paper_contract_template')
                           || '["special_contract_template_name"]'::jsonb
       WHERE module_code = 'contract'
    `);
  }

  async down(): Promise<void> {
    // ponytail: preserve historical field values and administrator configuration during rollback.
  }
}
