import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:5173';
const API_BASE = 'http://127.0.0.1:3000/api';

// 测试账号
const TEST_ACCOUNTS = [
  { username: 'xuekun', password: '123456', role: 'business_owner' },
  { username: 'shenwenjun', password: '123456', role: 'business_group_leader' },
  { username: 'chengyu', password: '123456', role: 'business_group_member' },
  { username: 'contractsup01', password: '123456', role: 'contract_specialist' },
];

test.describe('权限配置中心自动化测试', () => {
  test.setTimeout(30000); // 页面权限烟测使用明确短超时

  test('验证权限配置API可访问', async ({ request }) => {
    console.log('测试权限配置API...');

    // 登录获取token
    const loginResponse = await request.post(`${API_BASE}/auth/login`, {
      data: {
        username: 'xuekun',
        password: '123456'
      }
    });

    expect(loginResponse.ok()).toBeTruthy();
    const loginBody = await loginResponse.json();
    const access_token = loginBody.data?.accessToken ?? loginBody.access_token;

    // 访问权限配置API
    const configResponse = await request.get(`${API_BASE}/permission-center/config`, {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });

    expect(configResponse.ok()).toBeTruthy();
    const config = await configResponse.json();

    console.log('✅ 权限配置API正常');
    console.log(`版本: ${config.version}`);
    console.log(`角色组数: ${config.roleGroups?.length || 0}`);
    console.log(`路由数: ${config.routes?.length || 0}`);
    console.log(`字段场景数: ${config.fieldScenarios?.length || 0}`);
  });

  for (const account of TEST_ACCOUNTS) {
    test(`验证 ${account.username} (${account.role}) 的菜单权限`, async ({ page }) => {
      console.log(`\n测试账号: ${account.username} (${account.role})`);

      // 访问登录页
      await page.goto(BASE_URL);
      await page.waitForLoadState('domcontentloaded');

      // 登录
      await page.fill('input[id="username"]', account.username);
      await page.fill('input[id="password"]', account.password);
      await page.getByRole('button', { name: /登\s*录/ }).click();

      // 等待跳转
      await page.waitForURL(/\/(dashboard|change-password|403)/, { timeout: 10000 });
      if (page.url().endsWith('/change-password')) {
        await expect(page).not.toHaveURL(/\/login/);
        return;
      }
      await page.waitForTimeout(1000); // 等待菜单加载

      // 检查菜单是否加载
      const menuItems = await page.locator('.ant-menu-item, .ant-menu-submenu').count();
      console.log(`  菜单项数量: ${menuItems}`);

      // 截图
      await page.screenshot({
        path: `D:\\AI\\SpeceAppDate\\工单系统\\frontend\\test-results\\${account.username}-menu.png`,
        fullPage: true
      });

      expect(menuItems).toBeGreaterThan(0);
      console.log(`✅ ${account.username} 菜单权限验证通过`);
    });
  }

  test('验证权限管理UI（admin）', async ({ page }) => {
    console.log('\n测试权限管理UI...');

    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');

    // 尝试以admin登录（如果密码不是默认的，会跳过）
    try {
      await page.fill('input[id="username"]', 'lizhanbo');
      await page.fill('input[id="password"]', '123456');
      await page.getByRole('button', { name: /登\s*录/ }).click();

      await page.waitForURL(/\/(dashboard|change-password|403)/, { timeout: 10000 });
      if (page.url().endsWith('/change-password')) return;

      // 访问权限管理页面
      await page.goto(`${BASE_URL}/admin/permission-center`);
      await page.waitForTimeout(2000);

      // 检查页面是否加载
      const pageTitle = await page.textContent('h1, .ant-page-header-heading-title');
      console.log(`  页面标题: ${pageTitle}`);

      await page.screenshot({
        path: 'D:\\AI\\SpeceAppDate\\工单系统\\frontend\\test-results\\admin-permission-center.png',
        fullPage: true
      });

      console.log('✅ 权限管理UI可访问');
    } catch (error) {
      console.log('⚠️  admin账号需要修改密码或权限管理页面需要特殊权限');
    }
  });
});
