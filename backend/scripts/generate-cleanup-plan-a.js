/* Plan A cleanup generator: backup JSON + SQL script (no execution). */
const { Client } = require('pg');
const fs = require('fs');

const STAMP = '20260517';
const BACKUP_PATH = 'D:/AI/SpeceAppDate/工单系统/backend/scripts/backup/dispatch-cleanup-backup-' + STAMP + '.json';
const SQL_PATH = 'D:/AI/SpeceAppDate/工单系统/backend/scripts/cleanup-dispatch-stale-' + STAMP + '.sql';

const DEFAULT_ACTIVE_RULE_NAMES = [
  'benefit-default-apply',
  'onboarding-default-data-entry',
  'renewal-default-contract',
  'resignation-default-contact',
  'onboarding-default-social-insurance',
];

const COMPAT_USER_IDS = [
  'ea01d84e-c624-48e7-b43c-c80fd607017a',
  'db69023e-b0b3-4f12-938d-e4b90da15c8a',
];

(async () => {
  const c = new Client({ host: '127.0.0.1', port: 5432, user: 'ticket', password: 'ticket123', database: 'ticket_system' });
  await c.connect();

  const r1 = await c.query(
    `SELECT * FROM dispatch_rules
     WHERE rule_name = ANY($1::text[]) AND is_active = true
       AND assignee_user_id IS NULL AND fallback_user_id IS NULL
       AND customer_id IS NULL AND trigger_conditions IS NULL`,
    [DEFAULT_ACTIVE_RULE_NAMES],
  );
  console.log('default rules to delete:', r1.rows.length);
  console.log(' ->', r1.rows.map((r) => r.rule_name).join(', '));

  const r2 = await c.query(`SELECT * FROM dispatch_rules WHERE is_active = false`);
  console.log('inactive rules to delete:', r2.rows.length);

  const r3 = await c.query(
    `SELECT * FROM module_handlers WHERE module_code='social_insurance' AND handler_id = ANY($1::uuid[])`,
    [COMPAT_USER_IDS],
  );
  console.log('social_insurance compat handlers to delete:', r3.rows.length);

  const backup = {
    generatedAt: new Date().toISOString(),
    note: 'Plan A cleanup backup. To restore, INSERT rows back from this JSON.',
    defaultActiveRules: r1.rows,
    inactiveRules: r2.rows,
    compatHandlers: r3.rows,
  };
  fs.writeFileSync(BACKUP_PATH, JSON.stringify(backup, null, 2), 'utf8');

  const quote = (id) => "'" + id + "'";
  const lines = [
    '-- Plan A cleanup of dispatch config stale rows',
    '-- Generated ' + new Date().toISOString(),
    '-- Backup JSON path: ' + BACKUP_PATH,
    'BEGIN;',
    '',
    '-- 5 active default rules (null trigger/assignee/customer)',
    `DELETE FROM dispatch_rules WHERE id IN (${r1.rows.map((r) => quote(r.id)).join(',')});`,
    '',
    '-- 15 inactive rules (QA + legacy seed)',
    `DELETE FROM dispatch_rules WHERE id IN (${r2.rows.map((r) => quote(r.id)).join(',')});`,
    '',
    '-- 2 social_insurance compat handlers',
    `DELETE FROM module_handlers WHERE id IN (${r3.rows.map((r) => quote(r.id)).join(',')});`,
    '',
    'COMMIT;',
    '',
  ];
  fs.writeFileSync(SQL_PATH, lines.join('\n'), 'utf8');

  console.log('\nbackup ->', BACKUP_PATH);
  console.log('sql    ->', SQL_PATH);

  await c.end();
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
