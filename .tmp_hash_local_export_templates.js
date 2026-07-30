const { Client } = require('./backend/node_modules/pg');
const client = new Client({ host: '127.0.0.1', port: 5432, user: 'postgres', password: 'postgres', database: 'ticket_system' });
const sql = `
WITH rows AS (
  SELECT id, template_name, module_code, is_shared, COALESCE(sign_platform,'') AS sign_platform,
         jsonb_array_length(field_list) AS n,
         md5(field_list::text) AS field_hash,
         (
           SELECT string_agg(COALESCE(e->>'fieldCode', e->>'field_code'), ',' ORDER BY COALESCE((e->>'order')::int, 999999))
           FROM jsonb_array_elements(field_list) e
         ) AS codes
    FROM export_templates
   WHERE module_code='contract' OR template_name ILIKE '%合同%' OR template_name ILIKE '%签%' OR COALESCE(sign_platform,'') <> ''
)
SELECT template_name,module_code,is_shared,sign_platform,n,field_hash,codes
  FROM rows
 ORDER BY module_code, sign_platform, template_name;
`;
(async () => {
  await client.connect();
  const res = await client.query(sql);
  for (const r of res.rows) console.log(JSON.stringify(r));
  await client.end();
})().catch(e => { console.error(e); process.exit(1); });
