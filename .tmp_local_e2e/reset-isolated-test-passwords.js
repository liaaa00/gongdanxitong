const { Client } = require('D:/ai/speceappdate/工单系统/.tmp_server_sync/primary-worktree/backend/node_modules/pg');
const bcrypt = require('D:/ai/speceappdate/工单系统/.tmp_server_sync/primary-worktree/backend/node_modules/bcrypt');

const accounts = [
  ['lizhanbo', 'LocalAdmin#2026'],
  ['zhaotianqi', 'LocalBiz#2026'],
];

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
    await client.query('BEGIN');
    const changed = [];
    for (const [username, password] of accounts) {
      const hash = await bcrypt.hash(password, 10);
      const result = await client.query(
        `UPDATE users
         SET password_hash = $1,
             must_change_password = false,
             auth_version = COALESCE(auth_version, 0) + 1
         WHERE username = $2
         RETURNING username, auth_version, must_change_password`,
        [hash, username],
      );
      if (result.rowCount !== 1) throw new Error('User not found: ' + username);
      changed.push(result.rows[0]);
    }
    await client.query('COMMIT');
    console.log(JSON.stringify({ database: 'ticket_system_e2e_20260730', changed }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
