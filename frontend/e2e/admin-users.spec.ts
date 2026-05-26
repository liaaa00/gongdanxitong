import { test, expect } from '@playwright/test';

test.describe('Admin Users Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[id="username"]', 'lizhanbo');
    await page.fill('input[id="password"]', '123456');
    await page.getByRole('button', { name: /登\s*录/ }).click();
    await page.waitForURL('**/dashboard', { timeout: 10000 });
  });

  test('admin can access users page', async ({ page }) => {
    await page.goto('/admin/users');
    await page.waitForSelector('.ant-pro-page-container', { timeout: 8000 });
    await expect(page.locator('.ant-pro-page-container')).toBeVisible();
  });
});
