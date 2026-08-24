import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaperContractTemplate20260823001000 implements MigrationInterface {
  name = 'AddPaperContractTemplate20260823001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO field_configs (
         field_code, field_name, field_type, is_required, default_required,
         conditional_required, help_text, order_type, business_context,
         display_order, is_active, is_included_in_template
       )
       SELECT
         'paper_contract_template',
         '纸质合同模板名称',
         'text',
         false,
         false,
         '{"op":"AND","children":[{"op":"EQ","field":"need_company_contract","value":"是"},{"op":"EQ","field":"need_esign","value":"2.否"}]}'::jsonb,
         '非电子签劳动合同填写实际使用的纸质合同模板名称。',
         'onboarding',
         '[\"onboarding\"]'::jsonb,
         COALESCE((SELECT display_order + 1 FROM field_configs WHERE field_code = 'contract_template'), 0),
         true,
         true
       WHERE NOT EXISTS (
         SELECT 1 FROM field_configs WHERE field_code = 'paper_contract_template'
       )`,
    );

    await queryRunner.query(
      `UPDATE field_configs
          SET field_name = '纸质合同模板名称',
              field_type = 'text',
              is_required = false,
              default_required = false,
              conditional_required = '{"op":"AND","children":[{"op":"EQ","field":"need_company_contract","value":"是"},{"op":"EQ","field":"need_esign","value":"2.否"}]}'::jsonb,
              help_text = '非电子签劳动合同填写实际使用的纸质合同模板名称。',
              order_type = 'onboarding',
              business_context = '[\"onboarding\"]'::jsonb,
              is_active = true,
              is_included_in_template = true
        WHERE field_code = 'paper_contract_template'`,
    );

    await queryRunner.query(
      `UPDATE import_template_fields
          SET display_order = display_order + 1,
              updated_at = now()
        WHERE order_type = 'onboarding'
          AND business_scope = 'beilun'
          AND display_order > COALESCE((
            SELECT display_order
              FROM import_template_fields
             WHERE order_type = 'onboarding'
               AND business_scope = 'beilun'
               AND field_code = 'contract_template'
          ), 0)`,
    );
    await queryRunner.query(
      `INSERT INTO import_template_fields (
         order_type, field_code, display_order, header_alias,
         is_required_override, is_active, business_scope, created_at, updated_at
       )
       SELECT
         'onboarding',
         'paper_contract_template',
         source.display_order + 1,
         '纸质合同模板名称',
         NULL,
         true,
         'beilun',
         now(),
         now()
       FROM import_template_fields source
       WHERE source.order_type = 'onboarding'
         AND source.business_scope = 'beilun'
         AND source.field_code = 'contract_template'
         AND NOT EXISTS (
           SELECT 1
             FROM import_template_fields existing
            WHERE existing.order_type = 'onboarding'
              AND existing.business_scope = 'beilun'
              AND existing.field_code = 'paper_contract_template'
         )`,
    );

    await queryRunner.query(
      `WITH scopes(business_scope) AS (VALUES ('beilun'), ('out_of_province'))
       INSERT INTO module_fields (
         module_code, business_scope, field_code, group_name, display_order,
         is_required_override, is_active, created_at, updated_at
       )
       SELECT
         'contract',
         scopes.business_scope,
         'paper_contract_template',
         '合同信息',
         COALESCE((SELECT display_order + 1 FROM module_fields
                    WHERE module_code = 'contract'
                      AND business_scope = scopes.business_scope
                      AND field_code = 'contract_template'), 0),
         false,
         true,
         now(),
         now()
       FROM scopes
       ON CONFLICT (module_code, field_code, business_scope) DO UPDATE
         SET group_name = EXCLUDED.group_name,
             is_required_override = false,
             is_active = true,
             updated_at = now()`,
    );

    await queryRunner.query(
      `WITH scopes(business_scope) AS (VALUES ('beilun'), ('out_of_province')),
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
         'paper_contract_template',
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
         'dispatched:contract',
         scopes.business_scope,
         now()
       FROM scopes
       CROSS JOIN role_codes
       INNER JOIN roles role ON role.code = role_codes.role_code
       ON CONFLICT (role_id, field_code, scenario, business_scope) DO UPDATE
         SET permission = EXCLUDED.permission`,
    );

    await queryRunner.query(
      `INSERT INTO field_supplement_rules (
         field_code, supplementer_module, sync_to_modules, is_active
       )
       SELECT 'paper_contract_template', 'contract', NULL, true
       WHERE NOT EXISTS (
         SELECT 1
           FROM field_supplement_rules
          WHERE field_code = 'paper_contract_template'
            AND supplementer_module = 'contract'
       )`,
    );

    await queryRunner.query(
      `UPDATE detail_view_templates
          SET field_list = COALESCE(field_list, '[]'::jsonb)
                         || '[{"fieldCode":"paper_contract_template","kind":"field"}]'::jsonb,
              updated_at = now()
        WHERE module_code = 'contract'
          AND is_active = true
          AND NOT EXISTS (
            SELECT 1
              FROM jsonb_array_elements(COALESCE(field_list, '[]'::jsonb)) item
             WHERE COALESCE(item->>'fieldCode', item->>'field_code') = 'paper_contract_template'
          )`,
    );

    await queryRunner.query(
      `UPDATE dispatched_orders
          SET visible_fields = COALESCE(visible_fields, '[]'::jsonb)
                            || '[\"paper_contract_template\"]'::jsonb
        WHERE module_code = 'contract'
          AND NOT (COALESCE(visible_fields, '[]'::jsonb) @> '[\"paper_contract_template\"]'::jsonb)`,
    );
  }

  async down(): Promise<void> {
    // 保留字段和历史字段快照，避免回滚破坏已保存的业务数据。
  }
}
