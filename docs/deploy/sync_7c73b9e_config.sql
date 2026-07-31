-- Commit: 7c73b9e3e0692a465d631058fd329e576abe3764
-- Scope: approved configuration tables only.
-- Business/identity/transaction rows are intentionally excluded.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TEMP TABLE sync_onboarding_template (
  field_code varchar(128) PRIMARY KEY,
  display_order integer NOT NULL
) ON COMMIT DROP;

INSERT INTO sync_onboarding_template (field_code, display_order) VALUES
  ('customer_name', 1),
  ('employee_name', 2),
  ('id_card_type', 3),
  ('id_card_no', 4),
  ('mobile', 5),
  ('position', 6),
  ('contract_start_date', 7),
  ('work_city', 8),
  ('base_salary', 9),
  ('social_location', 10),
  ('bank_account', 11),
  ('bank_name', 12),
  ('customer_code', 13),
  ('outsource_type', 14),
  ('position_type', 15),
  ('household_type', 16),
  ('ethnicity', 17),
  ('education', 18),
  ('graduation_school', 19),
  ('major', 20),
  ('graduation_date', 21),
  ('marital_status', 22),
  ('email', 23),
  ('current_address', 24),
  ('household_address', 25),
  ('postal_code', 26),
  ('contract_term_type', 27),
  ('contract_term', 28),
  ('contract_end_date', 29),
  ('probation_start_date', 30),
  ('probation_months', 31),
  ('probation_end_date', 32),
  ('work_hour_system', 33),
  ('salary_form', 34),
  ('other_salary', 35),
  ('probation_salary', 36),
  ('probation_other_salary', 37),
  ('payroll_cycle', 38),
  ('payroll_date', 39),
  ('start_month', 40),
  ('social_base', 41),
  ('fund_base', 42),
  ('fund_ratio', 43),
  ('remark', 44),
  ('business_mode', 45),
  ('employee_type', 46),
  ('need_company_contract', 47),
  ('need_esign', 48),
  ('esign_platform', 49),
  ('contract_subject', 50),
  ('company_address', 51),
  ('project_name', 52),
  ('work_arrangement', 53),
  ('contract_template', 54),
  ('need_contract_urge', 55),
  ('need_onboarding_contact', 56),
  ('feedback_deadline', 57),
  ('is_common_template', 58),
  ('template_name', 59),
  ('need_company_payroll', 60),
  ('payroll_location', 61),
  ('social_urge', 62),
  ('special_remark', 63);

DO $$
DECLARE
  missing_count integer;
BEGIN
  SELECT count(*) INTO missing_count
  FROM sync_onboarding_template t
  LEFT JOIN field_configs f ON f.field_code = t.field_code
  WHERE f.field_code IS NULL OR NOT f.is_active;
  IF missing_count <> 0 THEN
    RAISE EXCEPTION 'onboarding template references missing or inactive fields: %', missing_count;
  END IF;
END $$;

UPDATE import_template_fields f
SET is_active = false, updated_at = now()
WHERE f.order_type = 'onboarding'::order_type_enum
  AND NOT EXISTS (
    SELECT 1 FROM sync_onboarding_template t WHERE t.field_code = f.field_code
  );

INSERT INTO import_template_fields (
  id, order_type, field_code, display_order, header_alias,
  is_required_override, is_active, created_at, updated_at
)
SELECT
  uuid_generate_v4(), 'onboarding'::order_type_enum, t.field_code, t.display_order,
  NULL, NULL, true, now(), now()
FROM sync_onboarding_template t
WHERE NOT EXISTS (
  SELECT 1
  FROM import_template_fields f
  WHERE f.order_type = 'onboarding'::order_type_enum
    AND f.field_code = t.field_code
);

UPDATE import_template_fields f
SET display_order = t.display_order, is_active = true, updated_at = now()
FROM sync_onboarding_template t
WHERE f.order_type = 'onboarding'::order_type_enum
  AND f.field_code = t.field_code;

DO $$
DECLARE
  active_count integer;
  distinct_count integer;
  min_order integer;
  max_order integer;
BEGIN
  SELECT count(*), count(DISTINCT field_code), min(display_order), max(display_order)
  INTO active_count, distinct_count, min_order, max_order
  FROM import_template_fields
  WHERE order_type = 'onboarding'::order_type_enum AND is_active;
  IF active_count <> 63 OR distinct_count <> 63 OR min_order <> 1 OR max_order <> 63 THEN
    RAISE EXCEPTION 'onboarding template validation failed: active %, distinct %, range %..%', active_count, distinct_count, min_order, max_order;
  END IF;
END $$;

CREATE TEMP TABLE sync_permission_targets (
  scenario varchar(128) NOT NULL,
  visible_fields text[] NOT NULL,
  editable_fields text[] NOT NULL
) ON COMMIT DROP;

INSERT INTO sync_permission_targets (scenario, visible_fields, editable_fields) VALUES
  (
    'dispatched:social_insurance',
    ARRAY[
      'customer_name','customer_code','outsource_type','position','position_type','employee_name','id_card_type','id_card_no','gender','birth_date','age','household_type','ethnicity',
      'education','graduation_school','major','graduation_date','marital_status','mobile','email','current_address','household_address','postal_code',
      'social_location','start_month','social_base','fund_base','fund_ratio','bank_name','bank_account','social_urge','special_remark','remark',
      'social_insurance_result','social_insurance_remark','medical_insurance_result','housing_fund_result'
    ],
    ARRAY['social_location','start_month','social_base','fund_base','fund_ratio','special_remark','social_insurance_result','social_insurance_remark','medical_insurance_result','housing_fund_result']
  ),
  (
    'dispatched:resignation_social_insurance',
    ARRAY[
      'customer_name','customer_code','mobile','email','employee_name','id_card_no','social_pay_region','social_stop_month','resignation_reason','resignation_date','need_resignation_share',
      'social_insurance_result','social_insurance_remark','medical_insurance_result','housing_fund_result'
    ],
    ARRAY['social_insurance_result','social_insurance_remark','medical_insurance_result','housing_fund_result']
  );

CREATE TEMP TABLE sync_permission_rows AS
SELECT
  r.id AS role_id,
  f.field_code,
  t.scenario,
  CASE
    WHEN NOT (
      (t.scenario = 'dispatched:social_insurance' AND (
        (jsonb_array_length(coalesce(f.business_context, '[]'::jsonb)) > 0 AND f.business_context @> '["onboarding"]'::jsonb)
        OR (jsonb_array_length(coalesce(f.business_context, '[]'::jsonb)) = 0 AND f.order_type = 'onboarding'::order_type_enum)
      ))
      OR
      (t.scenario = 'dispatched:resignation_social_insurance' AND (
        (jsonb_array_length(coalesce(f.business_context, '[]'::jsonb)) > 0 AND f.business_context @> '["resignation"]'::jsonb)
        OR (jsonb_array_length(coalesce(f.business_context, '[]'::jsonb)) = 0 AND f.order_type = 'resignation'::order_type_enum)
      ))
    ) THEN 'hidden'::field_permission_mode_enum
    WHEN NOT (f.field_code = ANY(t.visible_fields)) THEN 'hidden'::field_permission_mode_enum
    WHEN f.field_code = ANY(t.editable_fields) THEN 'visible'::field_permission_mode_enum
    ELSE 'readonly'::field_permission_mode_enum
  END AS permission
FROM roles r
CROSS JOIN sync_permission_targets t
CROSS JOIN field_configs f
WHERE r.code = 'social_insurance_specialist';

INSERT INTO field_permissions (id, role_id, field_code, scenario, permission, created_at)
SELECT uuid_generate_v4(), role_id, field_code, scenario, permission, now()
FROM sync_permission_rows
ON CONFLICT (role_id, field_code, scenario)
DO UPDATE SET permission = EXCLUDED.permission;

DO $$
DECLARE
  expected_fields integer;
  scenario_count integer;
  distinct_fields integer;
BEGIN
  SELECT count(*) INTO expected_fields FROM field_configs;
  IF expected_fields = 0 THEN
    RAISE EXCEPTION 'field_configs is empty';
  END IF;
  FOR scenario_count, distinct_fields IN
    SELECT count(*), count(DISTINCT field_code)
    FROM field_permissions fp
    JOIN roles r ON r.id = fp.role_id
    WHERE r.code = 'social_insurance_specialist'
      AND fp.scenario = 'dispatched:social_insurance'
  LOOP
    IF scenario_count <> expected_fields OR distinct_fields <> expected_fields THEN
      RAISE EXCEPTION 'social_insurance permission validation failed: rows %, distinct %, expected %', scenario_count, distinct_fields, expected_fields;
    END IF;
  END LOOP;
  SELECT count(*), count(DISTINCT field_code)
  INTO scenario_count, distinct_fields
  FROM field_permissions fp
  JOIN roles r ON r.id = fp.role_id
  WHERE r.code = 'social_insurance_specialist'
    AND fp.scenario = 'dispatched:resignation_social_insurance';
  IF scenario_count <> expected_fields OR distinct_fields <> expected_fields THEN
    RAISE EXCEPTION 'resignation_social_insurance permission validation failed: rows %, distinct %, expected %', scenario_count, distinct_fields, expected_fields;
  END IF;
END $$;

COMMIT;
