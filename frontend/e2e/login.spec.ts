import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test('redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL('**/login');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login with admin credentials succeeds', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[id="username"]', 'admin');
    await page.fill('input[id="password"]', 'admin123');
    await page.getByRole('button', { name: /登\s*录/ }).click();
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    await expect(page.locator('.ant-pro-page-container')).toBeVisible();
  });

  test('login with wrong password shows error', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[id="username"]', 'admin');
    await page.fill('input[id="password"]', 'wrong');
    await page.getByRole('button', { name: /登\s*录/ }).click();
    await expect(page.locator('.ant-message-error')).toBeVisible({ timeout: 5000 });
  });
});
