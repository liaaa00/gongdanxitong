import { DataSource } from 'typeorm';

async function main() {
  const ds = new DataSource({
    type: 'postgres',
    host: '127.0.0.1',
    port: 5433,
    username: 'postgres',
    password: 'postgres',
    database: 'ticket_system',
  });

  await ds.initialize();

  const fields: any[] = await ds.query(`
    SELECT field_code, field_name, display_order, is_required, default_required
    FROM field_configs
    WHERE is_active = true
      AND (order_type IS NULL OR order_type = 'onboarding' OR business_context @> '["onboarding"]')
      AND field_code NOT IN ('gender', 'birth_date', 'age', 'contract_feedback', 'onboarding_feedback', 'data_entry_feedback', 'social_insurance_result', 'social_insurance_remark', 'medical_insurance_result', 'housing_fund_result')
    ORDER BY display_order, created_at
  `);

  console.log(`共 ${fields.length} 个入职导入字段\n`);
  fields.forEach((f: any, i: number) => {
    console.log(`${i + 1}. ${f.field_code} | ${f.field_name} | order=${f.display_order}`);
  });

  await ds.destroy();
}

main().catch(console.error);
