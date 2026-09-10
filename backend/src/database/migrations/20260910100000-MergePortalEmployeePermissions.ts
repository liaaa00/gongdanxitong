import { MigrationInterface, QueryRunner } from 'typeorm';

/** Merge the legacy onboarding/resignation grants into employee_changes. */
export class MergePortalEmployeePermissions20260910100000 implements MigrationInterface {
  name = 'MergePortalEmployeePermissions20260910100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE customer_portal_accounts
      SET business_permissions = COALESCE(mapped.permissions, '[]'::jsonb)
      FROM (
        SELECT account.id,
               COALESCE(
                 jsonb_agg(DISTINCT mapped_value ORDER BY mapped_value) FILTER (WHERE mapped_value IS NOT NULL),
                 '[]'::jsonb
               ) AS permissions
        FROM customer_portal_accounts account
        LEFT JOIN LATERAL jsonb_array_elements_text(account.business_permissions) raw(value) ON true
        LEFT JOIN LATERAL (
          SELECT CASE
            WHEN raw.value IN ('onboarding', 'resignation') THEN 'employee_changes'
            WHEN raw.value IN ('employee_changes', 'salary') THEN raw.value
            ELSE NULL
          END AS mapped_value
        ) mapped ON mapped.mapped_value IS NOT NULL
        GROUP BY account.id
      ) mapped
      WHERE customer_portal_accounts.id = mapped.id
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE customer_portal_accounts
      SET business_permissions = (
        SELECT COALESCE(jsonb_agg(DISTINCT expanded.value ORDER BY expanded.value), '[]'::jsonb)
        FROM jsonb_array_elements_text(customer_portal_accounts.business_permissions) item(value)
        CROSS JOIN LATERAL (
          SELECT item.value AS value WHERE item.value <> 'employee_changes'
          UNION ALL SELECT 'onboarding' WHERE item.value = 'employee_changes'
          UNION ALL SELECT 'resignation' WHERE item.value = 'employee_changes'
        ) expanded
      )
      WHERE business_permissions ? 'employee_changes'
    `);
  }
}
