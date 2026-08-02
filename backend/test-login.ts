import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

async function main() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: '127.0.0.1',
    port: 5433,
    username: 'postgres',
    password: 'postgres',
    database: 'ticket_system',
    synchronize: false,
  });

  await dataSource.initialize();

  // 查询现有用户
  const users = await dataSource.query('SELECT id, username, real_name FROM users LIMIT 5');
  console.log('现有用户:', users);

  // 创建测试用户 testadmin/test123
  const existing = await dataSource.query('SELECT id FROM users WHERE username = $1', ['testadmin']);
  if (existing.length === 0) {
    console.log('创建测试用户 testadmin/test123');
    const hash = await bcrypt.hash('test123', 10);
    await dataSource.query(
      `INSERT INTO users (username, real_name, email, phone, password_hash, is_active, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['testadmin', '测试管理员', 'testadmin@example.com', '13900000000', hash, true, false]
    );

    // 查询 admin 角色和部门
    const adminRole = await dataSource.query('SELECT id FROM roles WHERE code = $1', ['admin']);
    const adminDept = await dataSource.query('SELECT id FROM departments WHERE code = $1', ['SYSTEM_ADMIN']);

    if (adminRole.length > 0 && adminDept.length > 0) {
      const newUser = await dataSource.query('SELECT id FROM users WHERE username = $1', ['testadmin']);
      await dataSource.query(
        'INSERT INTO user_roles (user_id, role_id, department_id, is_primary) VALUES ($1, $2, $3, $4)',
        [newUser[0].id, adminRole[0].id, adminDept[0].id, true]
      );
      console.log('已分配 admin 角色');
    }
  } else {
    console.log('testadmin 用户已存在');
  }

  await dataSource.destroy();
}

main().catch(console.error);
