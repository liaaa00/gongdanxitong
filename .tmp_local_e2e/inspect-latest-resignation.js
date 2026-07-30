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
    const result = await client.query(`
      SELECT w.id AS parent_id, w.order_no, w.status AS parent_status,
             d.id, d.module_code, d.status, u.username AS handler_username,
             u.real_name AS handler_name
      FROM work_orders w
      JOIN dispatched_orders d ON d.parent_order_id = w.id
      LEFT JOIN users u ON u.id = d.handler_id
      WHERE w.order_type = 'resignation'
      ORDER BY w.created_at DESC, d.module_code
      LIMIT 3
    `);
    console.log(JSON.stringify(result.rows, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
