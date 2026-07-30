const { Client } = require('pg');

const client = new Client({
  host: '127.0.0.1',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'ticket_system'
});

const names = ['陈丽', '杨易', '戴俊祥', '朱敏', '戴敏华', '方志英', '何晓丽', '钱卓贇', '何依恬', '余正', '徐晓芬', '羊晓焓', '杨杰'];

(async () => {
  try {
    await client.connect();
    const res = await client.query(
      `SELECT id, username, realname FROM "user" WHERE realname = ANY($1::text[]) ORDER BY realname`,
      [names]
    );
    console.log('=== User表查询结果 ===');
    console.log('realname | username | id');
    console.log('---------|----------|----');
    res.rows.forEach(r => console.log(`${r.realname} | ${r.username} | ${r.id}`));
    
    const found = res.rows.map(r => r.realname);
    const missing = names.filter(n => !found.includes(n));
    if (missing.length > 0) {
      console.log('\n=== 系统里不存在的人名 ===');
      missing.forEach(n => console.log(`❌ ${n}`));
    }
    await client.end();
  } catch (err) {
    console.error('连接失败，尝试后端API接口查询...');
    process.exit(1);
  }
})();
