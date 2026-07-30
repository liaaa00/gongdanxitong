// 最小化测试：直接使用psql命令行插入数据
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function manualSeed() {
  console.log('=== 尝试手动seed province_handlers ===\n');

  const seedSQL = `
-- 测试插入3个省份
INSERT INTO province_handlers (id, province, handler_id, weight, is_active)
SELECT
  gen_random_uuid(),
  province,
  (SELECT id FROM users LIMIT 1),
  10,
  true
FROM (VALUES ('广东'), ('北京'), ('上海')) AS t(province)
WHERE NOT EXISTS (
  SELECT 1 FROM province_handlers WHERE province_handlers.province = t.province
);

SELECT COUNT(*) as count FROM province_handlers;
`;

  const psqlCmd = `psql -h 127.0.0.1 -p 5432 -U postgres -d ticket_system -c "${seedSQL.replace(/\n/g, ' ')}"`;

  try {
    const { stdout, stderr } = await execAsync(psqlCmd, {
      env: { ...process.env, PGPASSWORD: 'postgres' }
    });
    console.log('✅ 执行成功:');
    console.log(stdout);
    if (stderr) console.error('警告:', stderr);
  } catch (error: any) {
    console.error('❌ 执行失败:', error.message);
    console.log('\n提示: 请确保psql已安装或使用其他方式连接数据库');
  }
}

void manualSeed();
