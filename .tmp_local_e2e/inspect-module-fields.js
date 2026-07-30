const { Client } = require('D:/ai/speceappdate/工单系统/.tmp_server_sync/primary-worktree/backend/node_modules/pg');

async function main() {
  const client = new Client({
    host: '127.0.0.1',
    port: 5433,
    user: 'postgres',
    password: 'postgres',
    database: 'ticket_system_e2e_20260730',
  });
  await client.connect();
  try {
    const modules = await client.query(`
      SELECT module_code,
             count(*) FILTER (WHERE is_active) AS active_count,
             array_agg(field_code ORDER BY display_order) FILTER (WHERE is_active) AS active_fields
      FROM module_fields
      WHERE module_code = ANY($1)
      GROUP BY module_code
      ORDER BY module_code
    `, [['contract', 'data_entry', 'onboarding_contact', 'social_insurance']]);
    const children = await client.query(`
      SELECT module_code, visible_fields
      FROM dispatched_orders
      WHERE parent_order_id = $1
      ORDER BY module_code
    `, ['f2f98542-89a6-46b3-9185-c3263c5abe50']);
    console.log(JSON.stringify({ modules: modules.rows, children: children.rows }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
