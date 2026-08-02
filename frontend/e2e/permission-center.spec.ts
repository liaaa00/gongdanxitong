import { expect, test } from '@playwright/test';
import { loginAs, mockCommonApis } from './_helpers';

const config = {
  version: '1.0.0',
  roles: [
    { id: 'role-admin', code: 'admin', canonicalCode: 'admin', name: '系统管理员', level: 'global', isActive: true },
    { id: 'role-member', code: 'business_group_member', canonicalCode: 'business_group_member', name: '业务员', level: 'execution', isActive: true },
  ],
  routePermissions: [
    { path: '/dashboard', allowedRoles: ['admin', 'business_group_member'], backendActions: ['route.dashboard'], menu: { title: '仪表盘' } },
  ],
  fieldPermissions: [
    { scenario: 'create:onboarding', description: '入职创建', roleFieldRules: { admin: { employee_name: 'visible' }, business_group_member: { employee_name: 'readonly' } } },
  ],
};

test('admin saves route permission edits as an inactive version', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockCommonApis(page, 'admin');
  await loginAs(page, 'admin', 'admin');

  const activeVersion = {
    id: 'version-1', version: '1.0.0', config, is_active: true, created_at: '2026-08-02T00:00:00Z',
  };
  let versions = [activeVersion];
  let createPayload: any;
  let activateCalls = 0;

  await page.route('**/api/permission-center/config', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, message: 'ok', data: config }) });
      return;
    }
    createPayload = await route.request().postDataJSON();
    versions = [{ id: 'version-2', version: createPayload.config.version, config: createPayload.config, is_active: false, created_at: '2026-08-02T01:00:00Z', description: createPayload.description }, ...versions];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, message: 'ok', data: versions[0] }) });
  });
  await page.route('**/api/permission-center/versions', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, message: 'ok', data: versions }) });
  });
  await page.route('**/api/permission-center/config/*/activate', async (route) => {
    activateCalls += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, message: 'ok', data: { message: 'ok' } }) });
  });

  await page.goto('/admin/permission-center');
  await expect(page.getByTitle('权限配置中心')).toBeVisible();
  await page.getByRole('tab', { name: '路由权限' }).click();
  await page.getByLabel('/dashboard-业务员').uncheck();
  await expect(page.getByText('当前有未保存修改')).toBeVisible();

  await page.getByRole('button', { name: /保存为新版本/ }).click();
  await page.getByLabel('变更说明').fill('收紧业务员仪表盘权限');
  await page.getByRole('button', { name: /确\s*定/ }).click();

  await expect.poll(() => createPayload?.config?.version).toBe('1.0.1');
  expect(createPayload.config.routePermissions[0].allowedRoles).toEqual(['admin']);
  expect(activateCalls).toBe(0);
});
