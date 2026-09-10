import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 任务3：离职证明快递单号（resignation_cert_tracking_number）。
 * 本地/生产 AUTO_SEED=false 时 seed 不落库，快递单号缺 field_configs 行、
 * 详情模板字段与字段权限行，导致子工单详情页不显示该字段。
 * 权限口径与 seed-field-permissions.ts 的矩阵一致：
 *   - dispatched:resignation_contact / dispatched:resignation_cert：
 *     处理岗（onboarding_specialist/shared_leader）可编辑（visible），
 *     业务岗只读，admin/welfare 可见，其余岗位 hidden；
 *   - create:resignation：admin/welfare/业务岗 visible，其余 readonly。
 */
export class AddResignationCertTrackingNumber20260908001000 implements MigrationInterface {
  name = 'AddResignationCertTrackingNumber20260908001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO field_configs (
        field_code, field_name, field_type, is_required, default_required,
        conditional_required, validation_regex, validation_msg, dropdown_options,
        collection_group, placeholder, help_text, order_type, business_context,
        display_order, is_active, is_included_in_template
      )
      VALUES (
        'resignation_cert_tracking_number', '离职证明快递单号', 'text', false, false,
        NULL, NULL, NULL, NULL,
        '离职信息', '请输入快递单号', '纸质离职证明寄出后填写快递单号，便于跟进签收。',
        'resignation', '["resignation"]'::jsonb,
        18, true, true
      )
      ON CONFLICT (field_code) DO UPDATE SET
        field_name = EXCLUDED.field_name,
        field_type = EXCLUDED.field_type,
        collection_group = EXCLUDED.collection_group,
        placeholder = EXCLUDED.placeholder,
        help_text = EXCLUDED.help_text,
        order_type = EXCLUDED.order_type,
        business_context = EXCLUDED.business_context,
        is_active = true,
        is_included_in_template = true
    `);

    await queryRunner.query(`
      UPDATE import_template_fields target
         SET display_order = target.display_order + 1,
             updated_at = now()
        FROM import_template_fields cert
       WHERE target.order_type = 'resignation'
         AND target.business_scope = cert.business_scope
         AND cert.order_type = 'resignation'
         AND cert.field_code = 'cert_delivery_address'
         AND target.display_order > cert.display_order
         AND NOT EXISTS (
           SELECT 1
             FROM import_template_fields existing
            WHERE existing.order_type = 'resignation'
              AND existing.field_code = 'resignation_cert_tracking_number'
              AND existing.business_scope = target.business_scope
         )
    `);

    await queryRunner.query(`
      INSERT INTO import_template_fields (
        order_type, field_code, display_order, header_alias,
        is_required_override, is_active, business_scope
      )
      SELECT
        'resignation',
        'resignation_cert_tracking_number',
        cert.display_order + 1,
        NULL,
        false,
        true,
        cert.business_scope
      FROM import_template_fields cert
      WHERE cert.order_type = 'resignation'
        AND cert.field_code = 'cert_delivery_address'
      ON CONFLICT (order_type, field_code, business_scope) DO UPDATE SET
        display_order = EXCLUDED.display_order,
        is_required_override = false,
        is_active = true,
        updated_at = now()
    `);

    await queryRunner.query(`
      UPDATE detail_view_templates template
         SET field_list = (
           SELECT
             COALESCE(jsonb_agg(item ORDER BY ord) FILTER (WHERE ord <= COALESCE(anchor.anchor_ord, 0)), '[]'::jsonb)
             || '[{"kind":"field","fieldCode":"resignation_cert_tracking_number"}]'::jsonb
             || COALESCE(jsonb_agg(item ORDER BY ord) FILTER (WHERE ord > COALESCE(anchor.anchor_ord, 0)), '[]'::jsonb)
           FROM jsonb_array_elements(COALESCE(template.field_list, '[]'::jsonb)) WITH ORDINALITY AS elems(item, ord)
           CROSS JOIN (
             SELECT max(elem2.ord2) AS anchor_ord
               FROM jsonb_array_elements(COALESCE(template.field_list, '[]'::jsonb)) WITH ORDINALITY AS elem2(item2, ord2)
              WHERE elem2.item2->>'fieldCode' = 'resignation_cert_format'
           ) anchor
         ),
         updated_at = now()
       WHERE template.module_code IN ('resignation_contact', 'resignation_cert')
         AND template.is_active = true
         AND NOT EXISTS (
           SELECT 1
             FROM jsonb_array_elements(COALESCE(template.field_list, '[]'::jsonb)) item
            WHERE item->>'fieldCode' = 'resignation_cert_tracking_number'
         )
    `);

    await queryRunner.query(`
      INSERT INTO field_permissions (role_id, field_code, scenario, permission, business_scope)
      SELECT roles.id,
             'resignation_cert_tracking_number',
             scenario.scenario,
             CASE roles.code
               WHEN 'admin' THEN 'visible'
               WHEN 'welfare_specialist' THEN 'visible'
               WHEN 'onboarding_specialist' THEN 'visible'
               WHEN 'shared_leader' THEN 'visible'
               WHEN 'biz_leader' THEN 'readonly'
               WHEN 'biz_manager' THEN 'readonly'
               WHEN 'biz_member' THEN 'readonly'
               ELSE 'hidden'
             END::field_permission_mode_enum,
             scope.business_scope
        FROM roles
        CROSS JOIN (VALUES
          ('dispatched:resignation_contact'),
          ('dispatched:resignation_cert')
        ) AS scenario(scenario)
        CROSS JOIN (VALUES ('beilun'), ('out_of_province')) AS scope(business_scope)
       WHERE roles.code IN (
         'admin', 'welfare_specialist', 'onboarding_specialist', 'shared_leader',
         'biz_leader', 'biz_manager', 'biz_member',
         'contract_specialist', 'data_entry_leader', 'social_insurance_specialist'
       )
       ON CONFLICT (role_id, field_code, scenario, business_scope) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO field_permissions (role_id, field_code, scenario, permission, business_scope)
      SELECT roles.id,
             'resignation_cert_tracking_number',
             'create:resignation',
             CASE
               WHEN roles.code IN ('admin', 'welfare_specialist', 'biz_leader', 'biz_manager', 'biz_member') THEN 'visible'
               ELSE 'readonly'
             END::field_permission_mode_enum,
             scope.business_scope
        FROM roles
        CROSS JOIN (VALUES ('beilun'), ('out_of_province')) AS scope(business_scope)
       WHERE roles.code IN (
         'admin', 'welfare_specialist', 'onboarding_specialist', 'shared_leader',
         'biz_leader', 'biz_manager', 'biz_member',
         'contract_specialist', 'data_entry_leader', 'social_insurance_specialist'
       )
       ON CONFLICT (role_id, field_code, scenario, business_scope) DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE import_template_fields
         SET is_active = false
       WHERE order_type = 'resignation'
         AND field_code = 'resignation_cert_tracking_number'
    `);

    await queryRunner.query(`
      DELETE FROM field_permissions
       WHERE field_code = 'resignation_cert_tracking_number'
    `);

    await queryRunner.query(`
      UPDATE detail_view_templates template
         SET field_list = (
           SELECT COALESCE(jsonb_agg(item ORDER BY ord), '[]'::jsonb)
             FROM jsonb_array_elements(COALESCE(template.field_list, '[]'::jsonb)) WITH ORDINALITY AS elems(item, ord)
            WHERE item->>'fieldCode' <> 'resignation_cert_tracking_number'
         ),
         updated_at = now()
       WHERE template.module_code IN ('resignation_contact', 'resignation_cert')
    `);

    await queryRunner.query(`
      UPDATE field_configs
         SET is_active = false
       WHERE field_code = 'resignation_cert_tracking_number'
    `);
  }
}
