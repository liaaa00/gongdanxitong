const { Client } = require('pg');
const client = new Client({
  host: '127.0.0.1',
  port: 5433,
  user: 'postgres',
  password: 'postgres',
  database: 'ticket_system'
});

async function check() {
  try {
    await client.connect();
    
    // 检查离职证明规则
    const rules = await client.query(
      "SELECT rule_name, target_module, trigger_conditions FROM dispatch_rules WHERE target_module = 'resignation_cert'"
    );
    console.log('=== 离职证明 dispatch_rules ===');
    console.log('数量:', rules.rows.length);
    if (rules.rows.length > 0) {
      rules.rows.forEach(r => console.log(JSON.stringify(r, null, 2)));
    }
    
    // 检查字段权限
    const perms = await client.query(
      "SELECT COUNT(*) as count FROM field_permissions WHERE module_code = 'resignation_cert'"
    );
    console.log('\n=== 离职证明 field_permissions ===');
    console.log('数量:', perms.rows[0].count);
    
  } catch (e) {
    console.error('查询失败:', e.message);
  } finally {
    await client.end();
  }
}
check();
