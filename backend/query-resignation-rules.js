const { Client } = require('pg');
const client = new Client({
  host: '127.0.0.1',
  port: 5433,
  user: 'postgres',
  password: 'postgres',
  database: 'ticket_system'
});

async function query() {
  try {
    await client.connect();
    const res = await client.query(
      "SELECT * FROM dispatch_rules WHERE module_code = 'resignation_cert' ORDER BY id"
    );
    console.log('离职证明规则数量:', res.rows.length);
    res.rows.forEach(r => console.log(JSON.stringify(r, null, 2)));
  } catch (e) {
    console.error('查询失败:', e.message);
  } finally {
    await client.end();
  }
}
query();
