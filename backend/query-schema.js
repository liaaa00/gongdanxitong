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
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'dispatch_rules'
      ORDER BY ordinal_position
    `);
    console.log('dispatch_rules 表结构:');
    res.rows.forEach(r => console.log(r.column_name, '-', r.data_type));
  } catch (e) {
    console.error('查询失败:', e.message);
  } finally {
    await client.end();
  }
}
query();
