import { test, expect } from '@playwright/test';

test.describe('Work Order Create Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[id="username"]', 'lizhanbo');
    await page.fill('input[id="password"]', '123456');
    await page.getByRole('button', { name: /登\s*录/ }).click();
    await page.waitForURL('**/dashboard', { timeout: 10000 });
  });

  test('navigate to new work order page', async ({ page }) => {
    await page.goto('/work-orders/new');
    await page.waitForSelector('.ant-pro-page-container');
    await expect(page.locator('.ant-pro-page-container')).toBeVisible();
  });

  test('create work order form renders fields', async ({ page }) => {
    await page.goto('/work-orders/new');
    await page.waitForSelector('.ant-form', { timeout: 8000 });
    const formItems = page.locator('.ant-form-item');
    await expect(formItems.first()).toBeVisible({ timeout: 5000 });
  });
});
