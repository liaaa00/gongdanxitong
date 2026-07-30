const { Client } = require('./backend/node_modules/pg');
const client = new Client({ host: '127.0.0.1', port: 5432, user: 'postgres', password: 'postgres', database: 'ticket_system' });
const sql = `
WITH rows AS (
  SELECT itf.display_order, itf.field_code, COALESCE(itf.header_alias, fc.field_name) AS header,
         itf.is_required_override, itf.is_active AS template_active,
         fc.is_active AS field_active, fc.field_type, fc.is_required, fc.default_required,
         fc.dropdown_options, fc.conditional_required, fc.help_text, fc.placeholder
    FROM import_template_fields itf
    LEFT JOIN field_configs fc ON fc.field_code = itf.field_code
   WHERE itf.order_type = 'onboarding'
   ORDER BY itf.display_order, itf.field_code
)
SELECT count(*) AS row_count, md5(jsonb_agg(to_jsonb(rows) ORDER BY display_order, field_code)::text) AS config_hash,
       jsonb_agg(to_jsonb(rows) ORDER BY display_order, field_code) AS rows_json
FROM rows;
`;
(async () => {
  await client.connect();
  const res = await client.query(sql);
  const row = res.rows[0];
  console.log(JSON.stringify({ row_count: row.row_count, config_hash: row.config_hash, rows: row.rows_json }, null, 2));
  await client.end();
})().catch(e => { console.error(e); process.exit(1); });
