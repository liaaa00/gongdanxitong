/* Plan A executor: runs cleanup-dispatch-stale-20260517.sql in a single transaction. */
const { Client } = require('pg');
const fs = require('fs');

const SQL_PATH = 'D:/AI/SpeceAppDate/工单系统/backend/scripts/cleanup-dispatch-stale-20260517.sql';

(async () => {
  const c = new Client({ host: '127.0.0.1', port: 5432, user: 'ticket', password: 'ticket123', database: 'ticket_system' });
  await c.connect();

  const before = await c.query(`
    SELECT
      (SELECT COUNT(*) FROM dispatch_rules) AS rules_total,
      (SELECT COUNT(*) FROM dispatch_rules WHERE is_active=true) AS rules_active,
      (SELECT COUNT(*) FROM module_handlers) AS handlers_total
  `);
  console.log('BEFORE:', before.rows[0]);

  const sql = fs.readFileSync(SQL_PATH, 'utf8');
  await c.query(sql);

  const after = await c.query(`
    SELECT
      (SELECT COUNT(*) FROM dispatch_rules) AS rules_total,
      (SELECT COUNT(*) FROM dispatch_rules WHERE is_active=true) AS rules_active,
      (SELECT COUNT(*) FROM module_handlers) AS handlers_total
  `);
  console.log('AFTER :', after.rows[0]);

  await c.end();
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
