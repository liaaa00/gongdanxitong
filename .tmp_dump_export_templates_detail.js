const { Client } = require('./backend/node_modules/pg');
const client = new Client({ host: '127.0.0.1', port: 5432, user: 'postgres', password: 'postgres', database: 'ticket_system' });
(async () => {
  await client.connect();
  const res = await client.query(`SELECT template_name, module_code, is_shared, COALESCE(sign_platform,'') sign_platform, field_list FROM export_templates WHERE module_code='contract' OR template_name ILIKE '%合同%' OR template_name ILIKE '%签%' OR COALESCE(sign_platform,'') <> '' ORDER BY module_code, sign_platform, template_name`);
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
})().catch(e => { console.error(e); process.exit(1); });
