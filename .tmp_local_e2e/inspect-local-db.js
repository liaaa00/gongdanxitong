const { Client } = require('D:/ai/speceappdate/工单系统/.tmp_server_sync/primary-worktree/backend/node_modules/pg');

async function query(database, text, params = []) {
  const client = new Client({
    host: '127.0.0.1',
    port: 5433,
    user: 'postgres',
    password: 'postgres',
    database,
  });
  await client.connect();
  try {
    return (await client.query(text, params)).rows;
  } finally {
    await client.end();
  }
}

async function main() {
  const activity = await query('postgres', `
    SELECT datname, usename, application_name, client_addr::text, state
    FROM pg_stat_activity
    WHERE datname IN ('ticket_system', 'ticket_system_e2e_20260730')
    ORDER BY datname, pid
  `);
  const sql = `
    SELECT username, auth_version, must_change_password, is_active
    FROM users
    WHERE username = ANY($1)
    ORDER BY username
  `;
  const isolated = await query('ticket_system_e2e_20260730', sql, [['lizhanbo', 'zhaotianqi']]);
  const original = await query('ticket_system', sql, [['lizhanbo', 'zhaotianqi']]);
  console.log(JSON.stringify({ activity, isolated, original }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
