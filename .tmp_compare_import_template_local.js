const { Client } = require('./backend/node_modules/pg');

const client = new Client({
  host: '127.0.0.1',
  port: 5432,
  user: process.env.LOCAL_PGUSER || 'postgres',
  password: process.env.LOCAL_PGPASSWORD || 'postgres',
  database: process.env.LOCAL_PGDATABASE || 'ticket_system',
});

async function main() {
  await client.connect();
  console.log('--- local import template counts ---');
  let res = await client.query(`SELECT order_type, count(*) FILTER (WHERE is_active) AS active_count, count(*) AS total_count FROM import_template_fields GROUP BY order_type ORDER BY order_type`);
  console.table(res.rows);

  console.log('--- local onboarding import template rows ---');
  res = await client.query(`SELECT itf.display_order, itf.field_code, COALESCE(itf.header_alias, fc.field_name) AS header, COALESCE(itf.is_required_override::text,'') AS required_override, itf.is_active::text AS template_active, fc.is_active::text AS field_active, fc.field_type, COALESCE(fc.dropdown_options::text,'') AS dropdown_options, COALESCE(fc.conditional_required::text,'') AS conditional_required FROM import_template_fields itf LEFT JOIN field_configs fc ON fc.field_code = itf.field_code WHERE itf.order_type = 'onboarding' ORDER BY itf.display_order, itf.field_code`);
  for (const r of res.rows) {
    console.log([r.display_order, r.field_code, r.header, r.required_override, r.template_active, r.field_active, r.field_type, r.dropdown_options, r.conditional_required].join('\t'));
  }

  console.log('--- local key import template overrides ---');
  res = await client.query(`SELECT order_type, field_code, display_order, header_alias, is_required_override, is_active, updated_at FROM import_template_fields WHERE order_type='onboarding' AND field_code IN ('feedback_deadline','is_common_template','template_name','contract_template','need_esign','need_onboarding_contact') ORDER BY display_order`);
  console.table(res.rows);

  console.log('--- local key field config values ---');
  res = await client.query(`SELECT field_code, field_name, is_required, default_required, dropdown_options, conditional_required, help_text FROM field_configs WHERE field_code IN ('feedback_deadline','is_common_template','template_name','contract_template','need_esign','esign_platform','need_company_contract','need_onboarding_contact','need_company_payroll','payroll_location','social_urge') ORDER BY display_order`);
  console.table(res.rows);
}

main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => client.end());
