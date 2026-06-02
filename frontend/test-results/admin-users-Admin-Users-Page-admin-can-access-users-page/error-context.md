# Instructions

> ⚠️ 当前演示口径（2026-06-03）：所有 seed/演示账号默认密码统一为 `123456`；`admin123` 是历史旧口径，会返回 401，不可用于演示。本文下方如出现 `admin123`，仅为历史错误快照/旧脚本背景，不代表当前可用密码。

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-users.spec.ts >> Admin Users Page >> admin can access users page
- Location: e2e\admin-users.spec.ts:12:3

# Error details

```
TimeoutError: page.waitForSelector: Timeout 8000ms exceeded.
Call log:
  - waiting for locator('.ant-pro-page-container') to be visible

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - img "Unauthorized" [ref=e6]
  - generic [ref=e60]: "403"
  - generic [ref=e61]: 抱歉，您没有权限访问此页面。
  - button "返回首页" [ref=e63] [cursor=pointer]:
    - generic [ref=e64]: 返回首页
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Admin Users Page', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/login');
  6  |     await page.fill('input[id="username"]', 'admin');
  7  |     await page.fill('input[id="password"]', 'admin123');
  8  |     await page.getByRole('button', { name: /登\s*录/ }).click();
  9  |     await page.waitForURL('**/dashboard', { timeout: 10000 });
  10 |   });
  11 | 
  12 |   test('admin can access users page', async ({ page }) => {
  13 |     await page.goto('/admin/users');
> 14 |     await page.waitForSelector('.ant-pro-page-container', { timeout: 8000 });
     |                ^ TimeoutError: page.waitForSelector: Timeout 8000ms exceeded.
  15 |     await expect(page.locator('.ant-pro-page-container')).toBeVisible();
  16 |   });
  17 | });
  18 | 
```