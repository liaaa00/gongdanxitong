import { expect, test, type Page } from '@playwright/test';

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('input[id="username"]', 'lizhanbo');
  await page.fill('input[id="password"]', '123456');
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await page.waitForURL('**/dashboard', { timeout: 10000 });
}

test.describe('字段与导入模板页面', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsAdmin(page);
  });

  test('字段管理页展示当前字段元数据和模板开关', async ({ page }) => {
    await page.goto('/admin/fields');

    await expect(page.getByText('表单字段管理', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '系统标识' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '字段名称' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '包含在标准模板' })).toBeVisible();
    await expect.poll(() => page.locator('tbody tr').count()).toBeGreaterThan(0);
    await expect.poll(() => page.locator('.ant-switch').count()).toBeGreaterThan(0);
  });

  test('导入模板配置页展示当前已选字段和可添加字段', async ({ page }) => {
    await page.goto('/admin/import-templates');

    await expect(page.getByText('导入模板配置', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('当前模板字段配置', { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/已选 \d+ 个，可选 \d+ 个/)).toBeVisible();
    await expect(page.getByRole('button', { name: /下载当前模板/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /保存配置/ })).toBeVisible();
    await expect.poll(() => page.locator('tbody tr').count()).toBeGreaterThan(0);
  });

  test('入职导入页使用服务器当前字段模板', async ({ page }) => {
    await page.goto('/work-orders/import?orderType=onboarding');

    await expect(page.getByText('入职导入', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: '下载当前字段模板' })).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: '返回入职主工单列表' })).toBeVisible();
  });
});
