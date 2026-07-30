const { Client } = require('./backend/node_modules/pg');
const fs = require('fs');
const client = new Client({ host: '127.0.0.1', port: 5432, user: 'postgres', password: 'postgres', database: 'ticket_system' });
function lit(v) {
  if (v === null || v === undefined || v === '') return 'NULL';
  return "'" + String(v).replace(/'/g, "''") + "'";
}
function jsonLit(v) {
  return "'" + JSON.stringify(v).replace(/'/g, "''") + "'::jsonb";
}
(async () => {
  await client.connect();
  const res = await client.query(`SELECT template_name, module_code, is_shared, sign_platform, field_list FROM export_templates WHERE module_code='contract' AND sign_platform IN ('速创','E签宝') ORDER BY sign_platform, template_name`);
  if (res.rows.length !== 2) throw new Error(`expected 2 contract templates, got ${res.rows.length}`);
  let sql = '';
  sql += '-- Sync only contract export template config from local DB. No business tables touched.\n';
  sql += 'BEGIN;\n';
  sql += "CREATE TEMP TABLE _contract_export_sync(template_name text, module_code text, is_shared boolean, sign_platform text, field_list jsonb) ON COMMIT DROP;\n";
  for (const r of res.rows) {
    sql += `INSERT INTO _contract_export_sync(template_name,module_code,is_shared,sign_platform,field_list) VALUES (${lit(r.template_name)}, ${lit(r.module_code)}, ${r.is_shared ? 'true' : 'false'}, ${lit(r.sign_platform)}, ${jsonLit(r.field_list)});\n`;
  }
  sql += `\nDO $$\nDECLARE\n  v_count int;\n  v_updated int;\n  v_missing text;\nBEGIN\n  SELECT count(*) INTO v_count FROM _contract_export_sync;\n  IF v_count <> 2 THEN\n    RAISE EXCEPTION 'expected 2 rows in sync temp, got %', v_count;\n  END IF;\n\n  SELECT string_agg(s.sign_platform, ',') INTO v_missing\n    FROM _contract_export_sync s\n   WHERE NOT EXISTS (\n     SELECT 1 FROM export_templates t\n      WHERE t.module_code = s.module_code\n        AND COALESCE(t.sign_platform,'') = COALESCE(s.sign_platform,'')\n   );\n  IF v_missing IS NOT NULL THEN\n    RAISE EXCEPTION 'missing target contract templates: %', v_missing;\n  END IF;\n\n  UPDATE export_templates t\n     SET field_list = s.field_list,\n         is_shared = s.is_shared,\n         template_name = s.template_name\n    FROM _contract_export_sync s\n   WHERE t.module_code = s.module_code\n     AND COALESCE(t.sign_platform,'') = COALESCE(s.sign_platform,'')\n     AND t.module_code = 'contract'\n     AND s.sign_platform IN ('速创','E签宝');\n\n  GET DIAGNOSTICS v_updated = ROW_COUNT;\n  IF v_updated <> 2 THEN\n    RAISE EXCEPTION 'expected to update 2 contract templates, updated %', v_updated;\n  END IF;\nEND $$;\n\n`;
  sql += "SELECT template_name, module_code, is_shared, sign_platform, jsonb_array_length(field_list) AS field_count, md5(field_list::text) AS field_hash FROM export_templates WHERE module_code='contract' AND sign_platform IN ('速创','E签宝') ORDER BY sign_platform, template_name;\n";
  sql += 'COMMIT;\n';
  fs.writeFileSync('.tmp_contract_export_sync.sql', sql, 'utf8');
  console.log(sql);
  await client.end();
})().catch(e => { console.error(e); process.exit(1); });
