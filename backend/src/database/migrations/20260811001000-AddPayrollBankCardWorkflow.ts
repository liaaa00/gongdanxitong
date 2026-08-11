import { MigrationInterface, QueryRunner } from 'typeorm';

const ONBOARDING_TEMPLATE_ORDER = [
  'customer_name', 'employee_name', 'id_card_type', 'id_card_no', 'mobile', 'email',
  'position', 'position_type', 'contract_term_type', 'contract_term', 'contract_start_date',
  'contract_end_date', 'probation_start_date', 'probation_months', 'probation_end_date',
  'work_city', 'work_hour_system', 'salary_form', 'base_salary', 'other_salary',
  'probation_salary', 'probation_other_salary', 'payroll_cycle', 'payroll_date',
  'social_location', 'start_month', 'social_base', 'fund_base', 'fund_ratio',
  'need_payroll_slip', 'remark', 'household_type', 'ethnicity', 'education',
  'marital_status', 'current_address', 'household_address', 'bank_location',
  'bank_name', 'bank_account', 'customer_code', 'outsource_type', 'business_mode',
  'employee_type', 'need_company_contract', 'need_esign', 'esign_platform',
  'contract_subject', 'company_address', 'project_name', 'work_arrangement',
  'contract_template', 'need_contract_urge', 'need_onboarding_contact',
  'feedback_deadline', 'is_common_template', 'template_name', 'need_company_payroll',
  'payroll_location', 'social_urge', 'special_remark',
] as const;

const PAYROLL_FIELDS = [
  'employee_name', 'id_card_no', 'bank_name', 'bank_account',
  'bank_location', 'payroll_location',
] as const;

const PAYROLL_EXPORT_FIELDS: Array<Record<string, unknown>> = [
  { fieldCode: 'employee_name', alias: '姓名', header: ['姓名'], order: 1 },
  { fieldCode: 'id_card_no', alias: '证件号码', header: ['证件号码'], order: 2 },
  { fieldCode: 'bank_name', alias: '开户行', header: ['开户行'], order: 3 },
  { fieldCode: 'bank_account', alias: '银行账号', header: ['银行账号'], order: 4 },
  { const: '', alias: '省', header: ['省'], order: 5 },
  { fieldCode: 'bank_location', alias: '开户地', header: ['开户地'], order: 6 },
  { const: '', alias: '区域代码', header: ['区域代码'], order: 7 },
  { const: '', alias: '', header: [''], order: 8 },
  { const: '', alias: '', header: [''], order: 9 },
  { fieldCode: 'branch_code', alias: '商社代码', header: ['商社代码'], order: 10 },
  { fieldCode: 'payroll_location', alias: '发薪地', header: ['发薪地'], order: 11 },
  { const: '', alias: '', header: [''], order: 12 },
  { const: '', alias: '', header: [''], order: 13 },
];

const RESIGNATION_CERT_FIELDS = [
  'customer_name', 'customer_code', 'mobile', 'email', 'position',
  'employee_name', 'id_card_no', 'resignation_reason', 'resignation_date',
  'need_resignation_cert', 'cert_delivery_address', 'resignation_cert_status',
] as const;

const DATA_ENTRY_PAYROLL_ACTIONS = [
  'route.onboarding',
  'route.onboarding_payroll_bank_card',
  'module.payroll_bank_card.manage',
  'dispatched_order.batch_import',
  'dispatched_order.batch_export',
  'dispatched_order.batch_accept',
  'dispatched_order.batch_complete',
] as const;

export class AddPayrollBankCardWorkflow20260811001000 implements MigrationInterface {
  name = 'AddPayrollBankCardWorkflow20260811001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE export_templates ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true',
    );
    await queryRunner.query('UPDATE export_templates SET is_active = true WHERE is_active IS NULL');

    await queryRunner.query(`
      INSERT INTO field_configs (
        field_code, field_name, field_type, is_required, default_required,
        dropdown_options, collection_group, help_text, order_type,
        business_context, display_order, is_active, is_included_in_template, created_at
      )
      VALUES (
        'need_payroll_slip', '是否需要工资单', 'dropdown', true, true,
        '["是","否"]'::jsonb, '薪资与发薪信息',
        '选择“是”时生成薪酬银行卡子工单。',
        'onboarding'::order_type_enum, '["onboarding"]'::jsonb,
        30, true, true, now()
      )
      ON CONFLICT (field_code) DO UPDATE SET
        field_name = EXCLUDED.field_name,
        field_type = EXCLUDED.field_type,
        is_required = true,
        default_required = true,
        dropdown_options = EXCLUDED.dropdown_options,
        collection_group = EXCLUDED.collection_group,
        help_text = EXCLUDED.help_text,
        order_type = EXCLUDED.order_type,
        business_context = EXCLUDED.business_context,
        is_active = true,
        is_included_in_template = true
    `);
    await queryRunner.query(`
      UPDATE field_configs
         SET field_name = '缴纳地'
       WHERE field_code = 'social_location'
    `);

    for (let index = 0; index < ONBOARDING_TEMPLATE_ORDER.length; index += 1) {
      const fieldCode = ONBOARDING_TEMPLATE_ORDER[index];
      await queryRunner.query(
        `INSERT INTO import_template_fields (
           order_type, field_code, display_order, header_alias,
           is_required_override, is_active, business_scope, created_at, updated_at
         )
         VALUES (
           'onboarding'::order_type_enum, $1, $2,
           CASE WHEN $1 = 'company_address' THEN '劳动合同主体注册地' ELSE NULL END,
           CASE WHEN $1 = 'feedback_deadline' THEN false ELSE NULL END,
           true, 'beilun', now(), now()
         )
         ON CONFLICT (order_type, field_code, business_scope) DO UPDATE SET
           display_order = EXCLUDED.display_order,
           header_alias = EXCLUDED.header_alias,
           is_required_override = EXCLUDED.is_required_override,
           is_active = true,
           updated_at = now()`,
        [fieldCode, index + 1],
      );
    }
    await queryRunner.query(
      `UPDATE import_template_fields
          SET is_active = false, updated_at = now()
        WHERE order_type = 'onboarding'::order_type_enum
          AND business_scope = 'beilun'
          AND NOT (field_code = ANY($1::varchar[]))`,
      [[...ONBOARDING_TEMPLATE_ORDER]],
    );

    await queryRunner.query(`
      INSERT INTO work_order_modules (
        module_code, business_scope, module_name, parent_module_code, module_type,
        description, display_order, is_active, dispatch_strategy,
        sla_hours, sla_reminder_before_hours, created_at, updated_at
      )
      VALUES (
        'payroll_bank_card', 'beilun', '薪酬银行卡', 'onboarding_management',
        'sub_module', '按是否需要工资单生成；银行卡资料完整后可办理和导出',
        12, true, 'pool', 24, 4, now(), now()
      )
      ON CONFLICT (module_code) DO UPDATE SET
        business_scope = 'beilun',
        module_name = EXCLUDED.module_name,
        parent_module_code = EXCLUDED.parent_module_code,
        module_type = EXCLUDED.module_type,
        description = EXCLUDED.description,
        display_order = EXCLUDED.display_order,
        is_active = true,
        sla_hours = EXCLUDED.sla_hours,
        sla_reminder_before_hours = EXCLUDED.sla_reminder_before_hours,
        updated_at = now()
    `);

    await queryRunner.query(`
      WITH desired(field_code, display_order) AS (
        VALUES
          ('employee_name', 1),
          ('id_card_no', 2),
          ('bank_name', 3),
          ('bank_account', 4),
          ('bank_location', 5),
          ('payroll_location', 6)
      )
      INSERT INTO module_fields (
        module_code, business_scope, field_code, group_name, display_order,
        is_required_override, is_active, created_at, updated_at
      )
      SELECT 'payroll_bank_card', 'beilun', field_code, '薪酬银行卡信息',
             display_order, NULL, true, now(), now()
        FROM desired
      ON CONFLICT (module_code, field_code, business_scope) DO UPDATE SET
        group_name = EXCLUDED.group_name,
        display_order = EXCLUDED.display_order,
        is_required_override = NULL,
        is_active = true,
        updated_at = now()
    `);
    await queryRunner.query(
      `UPDATE module_fields
          SET is_active = false, updated_at = now()
        WHERE module_code = 'payroll_bank_card'
          AND business_scope = 'beilun'
          AND NOT (field_code = ANY($1::varchar[]))`,
      [[...PAYROLL_FIELDS]],
    );

    await queryRunner.query(`
      WITH desired(action_code, action_name, remark_required, form_schema) AS (
        VALUES
          ('complete', '完成', false, NULL::jsonb),
          ('confirm_read', '确认已阅', false, NULL::jsonb),
          (
            'return_completed',
            '退回已完成子单',
            true,
            '{"fields":[{"fieldCode":"returnReason","label":"退回原因","required":true}]}'::jsonb
          )
      )
      INSERT INTO action_configs (
        module_code, business_scope, action_code, action_name, required_roles,
        form_schema, remark_required, is_active, created_at, updated_at
      )
      SELECT 'payroll_bank_card', 'beilun', action_code, action_name, NULL,
             form_schema, remark_required, true, now(), now()
        FROM desired
      ON CONFLICT (module_code, action_code, business_scope) DO UPDATE SET
        action_name = EXCLUDED.action_name,
        form_schema = EXCLUDED.form_schema,
        remark_required = EXCLUDED.remark_required,
        is_active = true,
        updated_at = now()
    `);

    await queryRunner.query(`
      UPDATE dispatch_rules
         SET order_type = 'onboarding'::order_type_enum,
             trigger_conditions = '{"field":"need_payroll_slip","op":"EQ","value":"是"}'::jsonb,
             target_module = 'payroll_bank_card',
             dispatch_strategy = 'fixed',
             priority = 35,
             allow_manual_override = true,
             is_active = true,
             business_scope = 'beilun'
       WHERE rule_name = 'payroll-bank-card-when-needed'
         AND business_scope = 'beilun'
    `);
    await queryRunner.query(`
      INSERT INTO dispatch_rules (
        rule_name, business_scope, order_type, trigger_conditions, target_module,
        customer_id, department_id, sub_module, assignee_user_id, fallback_user_id,
        allow_manual_override, dispatch_strategy, is_active, priority, created_at
      )
      SELECT
        'payroll-bank-card-when-needed', 'beilun', 'onboarding'::order_type_enum,
        '{"field":"need_payroll_slip","op":"EQ","value":"是"}'::jsonb,
        'payroll_bank_card', NULL, NULL, NULL, NULL, NULL,
        true, 'fixed', true, 35, now()
      WHERE NOT EXISTS (
        SELECT 1 FROM dispatch_rules
         WHERE rule_name = 'payroll-bank-card-when-needed'
           AND business_scope = 'beilun'
      )
    `);

    await queryRunner.query(`
      INSERT INTO field_permissions (
        role_id, field_code, permission, scenario, business_scope, created_at
      )
      SELECT
        role.id,
        field.field_code,
        CASE
          WHEN field.field_code = ANY($1::varchar[]) THEN
            CASE
              WHEN role.code IN ('admin', 'welfare_specialist') THEN 'visible'
              WHEN role.code IN (
                'business_group_member', 'biz_member',
                'business_owner', 'business_group_leader', 'biz_manager', 'biz_leader',
                'data_entry_leader'
              ) THEN 'readonly'
              ELSE 'hidden'
            END
          ELSE 'hidden'
        END::field_permission_mode_enum,
        'dispatched:payroll_bank_card',
        'beilun',
        now()
      FROM roles role
      CROSS JOIN field_configs field
      WHERE role.code IN (
        'admin', 'welfare_specialist',
        'business_group_member', 'biz_member',
        'business_owner', 'business_group_leader', 'biz_manager', 'biz_leader',
        'data_entry_leader', 'shared_team_owner', 'shared_leader',
        'labor_contract_member', 'contract_specialist',
        'onboarding_resignation_member', 'onboarding_specialist',
        'social_insurance_specialist'
      )
      ON CONFLICT (role_id, field_code, scenario, business_scope) DO UPDATE SET
        permission = EXCLUDED.permission
    `, [[...PAYROLL_FIELDS]]);

    for (const fieldCode of ['bank_name', 'bank_account', 'bank_location', 'payroll_location']) {
      await queryRunner.query(
        `UPDATE field_supplement_rules
            SET sync_to_modules = '["payroll_bank_card"]'::jsonb,
                is_active = true
          WHERE field_code = $1
            AND supplementer_module = 'onboarding_contact'`,
        [fieldCode],
      );
      await queryRunner.query(
        `INSERT INTO field_supplement_rules (
           field_code, supplementer_module, sync_to_modules, is_active
         )
         SELECT $1, 'onboarding_contact', '["payroll_bank_card"]'::jsonb, true
         WHERE NOT EXISTS (
           SELECT 1 FROM field_supplement_rules
            WHERE field_code = $1
              AND supplementer_module = 'onboarding_contact'
         )`,
        [fieldCode],
      );
    }

    await queryRunner.query(`
      UPDATE export_templates
         SET is_active = false
       WHERE module_code = 'payroll_bank_card'
         AND business_scope = 'beilun'
         AND template_name <> '薪酬银行卡批导出模板'
    `);
    await queryRunner.query(
      `UPDATE export_templates
          SET field_list = $1::jsonb,
              is_shared = true,
              sign_platform = NULL,
              is_active = true
        WHERE module_code = 'payroll_bank_card'
          AND business_scope = 'beilun'
          AND template_name = '薪酬银行卡批导出模板'`,
      [JSON.stringify(PAYROLL_EXPORT_FIELDS)],
    );
    await queryRunner.query(
      `INSERT INTO export_templates (
         template_name, module_code, field_list, created_by,
         is_shared, sign_platform, business_scope, is_active, created_at
       )
       SELECT
         '薪酬银行卡批导出模板', 'payroll_bank_card', $1::jsonb, user_id,
         true, NULL, 'beilun', true, now()
       FROM (
         SELECT id AS user_id
           FROM users
          WHERE is_active = true
          ORDER BY CASE WHEN username = 'admin' THEN 0 ELSE 1 END, created_at ASC
          LIMIT 1
       ) creator
       WHERE NOT EXISTS (
         SELECT 1 FROM export_templates
          WHERE module_code = 'payroll_bank_card'
            AND business_scope = 'beilun'
            AND template_name = '薪酬银行卡批导出模板'
       )`,
      [JSON.stringify(PAYROLL_EXPORT_FIELDS)],
    );

    await queryRunner.query(`
      UPDATE detail_view_templates
         SET module_code = 'resignation_cert',
             updated_at = now()
       WHERE module_code = 'resignation_certificate'
         AND business_scope = 'beilun'
    `);

    await this.ensureDetailTemplate(
      queryRunner,
      'payroll_bank_card',
      '薪酬银行卡详情页字段',
      PAYROLL_FIELDS,
    );
    await this.ensureDetailTemplate(
      queryRunner,
      'resignation_cert',
      '离职证明详情页字段',
      RESIGNATION_CERT_FIELDS,
    );

    const settingRows = await queryRunner.query(
      `SELECT key, value
         FROM system_settings
        WHERE key = 'roleActionPermissions.v1.beilun'`,
    ) as Array<{ key: string; value: string }>;
    if (settingRows[0]) {
      try {
        const parsed = JSON.parse(settingRows[0].value) as { roles?: Record<string, string[]> };
        const roles = parsed.roles ?? {};
        for (const roleCode of ['admin', 'data_entry_leader']) {
          const current = Array.isArray(roles[roleCode]) ? roles[roleCode] : [];
          roles[roleCode] = Array.from(new Set([...current, ...DATA_ENTRY_PAYROLL_ACTIONS]));
        }
        await queryRunner.query(
          `UPDATE system_settings
              SET value = $1, is_encrypted = false, updated_at = now()
            WHERE key = 'roleActionPermissions.v1.beilun'`,
          [JSON.stringify({ ...parsed, roles })],
        );
      } catch {
        // Keep a malformed custom setting untouched; runtime defaults remain available.
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE export_templates
         SET is_active = false
       WHERE module_code = 'payroll_bank_card'
         AND business_scope = 'beilun'
    `);
    await queryRunner.query(`
      UPDATE detail_view_templates
         SET is_active = false, updated_at = now()
       WHERE module_code = 'payroll_bank_card'
         AND business_scope = 'beilun'
    `);
    await queryRunner.query(`
      UPDATE action_configs
         SET is_active = false, updated_at = now()
       WHERE module_code = 'payroll_bank_card'
         AND business_scope = 'beilun'
    `);
    await queryRunner.query(`
      UPDATE module_fields
         SET is_active = false, updated_at = now()
       WHERE module_code = 'payroll_bank_card'
         AND business_scope = 'beilun'
    `);
    await queryRunner.query(`
      UPDATE work_order_modules
         SET is_active = false, updated_at = now()
       WHERE module_code = 'payroll_bank_card'
         AND business_scope = 'beilun'
    `);
    await queryRunner.query(`
      UPDATE dispatch_rules
         SET is_active = false
       WHERE rule_name = 'payroll-bank-card-when-needed'
         AND business_scope = 'beilun'
    `);
  }

  private async ensureDetailTemplate(
    queryRunner: QueryRunner,
    moduleCode: string,
    templateName: string,
    fieldCodes: readonly string[],
  ): Promise<void> {
    const fieldList = fieldCodes.map((fieldCode) => ({ fieldCode, kind: 'field' }));
    await queryRunner.query(
      `UPDATE detail_view_templates
          SET field_list = $1::jsonb,
              is_active = true,
              updated_at = now()
        WHERE module_code = $2
          AND business_scope = 'beilun'
          AND template_name = $3`,
      [JSON.stringify(fieldList), moduleCode, templateName],
    );
    await queryRunner.query(
      `INSERT INTO detail_view_templates (
         template_name, module_code, business_scope, field_list,
         is_active, created_by, created_at, updated_at
       )
       SELECT $3, $2, 'beilun', $1::jsonb, true, NULL, now(), now()
       WHERE NOT EXISTS (
         SELECT 1 FROM detail_view_templates
          WHERE module_code = $2
            AND business_scope = 'beilun'
            AND template_name = $3
       )`,
      [JSON.stringify(fieldList), moduleCode, templateName],
    );
  }
}
