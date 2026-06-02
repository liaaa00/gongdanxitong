import { test, expect } from '@playwright/test';

const modules = ['data_entry', 'social_insurance', 'onboarding_contact', 'contract'] as const;

const adminUser = {
  id: 'e2e-admin',
  username: 'e2e-admin',
  real_name: 'E2E Admin',
  roles: [{ id: 'role-admin', code: 'admin', name: '管理员', level: '全局' }],
  permissions: ['*'],
};

test.describe('dispatched-orders multi-module 500 regression', () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, data: adminUser }),
      });
    });

    await page.route('**/api/dispatched-orders**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 500, message: 'mock dispatched-orders failure' }),
      });
    });

    await page.addInitScript((user) => {
      window.localStorage.setItem('token', 'e2e-token');
      window.localStorage.setItem('user', JSON.stringify(user));
    }, adminUser);
  });

  test('four module pages resolve 500 list failures without GlobalError unhandledrejection', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

    for (const moduleCode of modules) {
      const responsePromise = page.waitForResponse((response) => {
        const url = response.url();
        return url.includes('/api/dispatched-orders') && url.includes(`module_code=${moduleCode}`);
      }, { timeout: 15_000 });

      await page.goto(`/onboarding/${moduleCode}`);
      const response = await responsePromise;
      expect(response.status(), `${moduleCode} mocked dispatched-orders status`).toBe(500);

      await page.waitForLoadState('networkidle');
      await expect(page.locator('.ant-pro-page-container, .ant-table-wrapper').first()).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('body')).not.toContainText('[GlobalError]');
    }

    const globalUnhandled = consoleErrors.filter((text) => text.includes('[GlobalError] unhandledrejection'));
    expect(globalUnhandled).toEqual([]);
  });
});
