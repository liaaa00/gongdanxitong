/**
 * 认证问题诊断工具
 * 用于检查 localStorage 中的用户和密码数据状态
 */

export function diagnoseAuthIssue() {
  if (typeof window === 'undefined' || !window.localStorage) {
    console.error('❌ localStorage 不可用');
    return;
  }

  console.log('🔍 开始诊断认证问题...\n');

  // 1. 检查用户列表
  const usersKey = 'mock_admin_users_v1';
  const usersRaw = window.localStorage.getItem(usersKey);
  console.log('📋 用户列表 (mock_admin_users_v1):');
  if (!usersRaw) {
    console.log('  ⚠️  未找到用户数据');
  } else {
    try {
      const users = JSON.parse(usersRaw);
      console.log(`  ✅ 找到 ${users.length} 个用户:`);
      users.forEach((u: any) => {
        console.log(`    - ${u.username} (${u.real_name}) [${u.is_active ? '启用' : '禁用'}]`);
      });
    } catch (e) {
      console.log('  ❌ 数据格式错误:', e);
    }
  }

  // 2. 检查密码列表
  const passwordsKey = 'mock_admin_passwords_v1';
  const passwordsRaw = window.localStorage.getItem(passwordsKey);
  console.log('\n🔑 密码列表 (mock_admin_passwords_v1):');
  if (!passwordsRaw) {
    console.log('  ⚠️  未找到密码数据');
  } else {
    try {
      const passwords = JSON.parse(passwordsRaw);
      console.log(`  ✅ 找到 ${passwords.length} 个密码条目:`);
      passwords.forEach((p: any) => {
        console.log(`    - ${p.username}: ${p.password_hash}`);
      });
    } catch (e) {
      console.log('  ❌ 数据格式错误:', e);
    }
  }

  // 3. 检查不匹配的情况
  console.log('\n🔍 检查用户与密码匹配情况:');
  if (usersRaw && passwordsRaw) {
    try {
      const users = JSON.parse(usersRaw);
      const passwords = JSON.parse(passwordsRaw);
      const passwordUsernames = new Set(passwords.map((p: any) => p.username));

      const usersWithoutPassword = users.filter((u: any) => !passwordUsernames.has(u.username));
      const passwordsWithoutUser = passwords.filter((p: any) => !users.find((u: any) => u.username === p.username));

      if (usersWithoutPassword.length > 0) {
        console.log('  ⚠️  以下用户没有密码条目:');
        usersWithoutPassword.forEach((u: any) => {
          console.log(`    - ${u.username} (${u.real_name})`);
        });
      }

      if (passwordsWithoutUser.length > 0) {
        console.log('  ⚠️  以下密码条目没有对应用户:');
        passwordsWithoutUser.forEach((p: any) => {
          console.log(`    - ${p.username}`);
        });
      }

      if (usersWithoutPassword.length === 0 && passwordsWithoutUser.length === 0) {
        console.log('  ✅ 所有用户都有对应的密码条目');
      }
    } catch (e) {
      console.log('  ❌ 检查失败:', e);
    }
  }

  // 4. 检查当前会话
  const sessionKey = 'mock_session_user_v1';
  const sessionRaw = window.localStorage.getItem(sessionKey);
  console.log('\n👤 当前会话 (mock_session_user_v1):');
  if (!sessionRaw) {
    console.log('  ℹ️  未登录');
  } else {
    try {
      const session = JSON.parse(sessionRaw);
      console.log(`  ✅ 已登录: ${session.username} (${session.real_name})`);
      console.log(`     角色: ${session.roles?.map((r: any) => r.name).join(', ')}`);
    } catch (e) {
      console.log('  ❌ 会话数据格式错误:', e);
    }
  }

  console.log('\n✅ 诊断完成');
}

/**
 * 修复认证问题
 * 为所有没有密码的用户创建默认密码
 */
export function fixAuthIssue() {
  if (typeof window === 'undefined' || !window.localStorage) {
    console.error('❌ localStorage 不可用');
    return;
  }

  console.log('🔧 开始修复认证问题...\n');

  const usersKey = 'mock_admin_users_v1';
  const passwordsKey = 'mock_admin_passwords_v1';

  const usersRaw = window.localStorage.getItem(usersKey);
  const passwordsRaw = window.localStorage.getItem(passwordsKey);

  if (!usersRaw) {
    console.log('❌ 未找到用户数据，无法修复');
    return;
  }

  try {
    const users = JSON.parse(usersRaw);
    let passwords = passwordsRaw ? JSON.parse(passwordsRaw) : [];

    const passwordUsernames = new Set(passwords.map((p: any) => p.username));
    const usersWithoutPassword = users.filter((u: any) => !passwordUsernames.has(u.username));

    if (usersWithoutPassword.length === 0) {
      console.log('✅ 所有用户都有密码，无需修复');
      return;
    }

    console.log(`⚠️  发现 ${usersWithoutPassword.length} 个用户没有密码，正在创建默认密码...`);

    // 为没有密码的用户创建默认密码
    usersWithoutPassword.forEach((u: any) => {
      const defaultPassword = u.username === 'admin' ? 'admin123' : '123456';
      passwords.push({
        username: u.username,
        password_hash: defaultPassword,
      });
      console.log(`  ✅ 为用户 ${u.username} 创建默认密码: ${defaultPassword}`);
    });

    // 保存更新后的密码列表
    window.localStorage.setItem(passwordsKey, JSON.stringify(passwords));
    console.log('\n✅ 修复完成！所有用户现在都可以登录了');
    console.log('ℹ️  默认密码: admin 用户为 admin123，其他用户为 123456');
  } catch (e) {
    console.log('❌ 修复失败:', e);
  }
}

// 在浏览器控制台中可以直接调用这些函数
if (typeof window !== 'undefined') {
  (window as any).diagnoseAuth = diagnoseAuthIssue;
  (window as any).fixAuth = fixAuthIssue;
  console.log('💡 诊断工具已加载，可在控制台使用:');
  console.log('   - diagnoseAuth() : 诊断认证问题');
  console.log('   - fixAuth()      : 自动修复认证问题');
}
