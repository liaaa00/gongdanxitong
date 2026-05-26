import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test('redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL('**/login');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login with admin credentials succeeds', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[id="username"]', 'lizhanbo');
    await page.fill('input[id="password"]', '123456');
    await page.keyboard.press('Enter');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    await expect(page.locator('.ant-pro-page-container')).toBeVisible();
  });

  test('login with wrong password stays on login page', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[id="username"]', 'lizhanbo');
    await page.fill('input[id="password"]', 'wrong123456');
    const loginFailed = page.waitForResponse((response) =>
      response.url().includes('/api/auth/login') && response.status() === 401,
    );
    await page.keyboard.press('Enter');
    await loginFailed;
    await expect(page).toHaveURL(/\/login/);
  });
});
