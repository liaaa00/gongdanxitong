import { expect, test, type Page } from '@playwright/test';

const SCREENSHOT_DIR = 'visual-smoke';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.fill('input[id="username"]', 'lizhanbo');
  await page.fill('input[id="password"]', '123456');
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await page.waitForURL('**/dashboard', { timeout: 10000 });
  await expect(page.locator('.ant-pro-page-container')).toBeVisible({ timeout: 10000 });
}

async function capturePage(page: Page, path: string, screenshotName: string) {
  await page.goto(path);
  await expect(page.locator('.ant-pro-page-container')).toBeVisible({ timeout: 10000 });
  await page.screenshot({ path: `test-results/${SCREENSHOT_DIR}/${screenshotName}.png`, fullPage: true });
}

async function expectPageText(page: Page, text: string) {
  await expect(page.locator('.ant-pro-page-container').getByText(text, { exact: false }).first()).toBeVisible();
}

test.describe('视觉截图巡检', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsAdmin(page);
  });

  test('关键页面自动打开并截图', async ({ page }) => {
    await capturePage(page, '/dashboard', '01-dashboard');
    await expectPageText(page, '全局运营看板');
    await expectPageText(page, '统计月份');
    await expect(page.getByText('管理员视图用于巡检全局数据和权限配置')).toHaveCount(0);

    const topCardTitles = ['总待处理', '单月待处理', '本月全量工单', '本月已完成', '本月已作废', '待关注消息'];
    for (const title of topCardTitles) {
      await expect(page.locator('.ant-statistic-title', { hasText: title }).first()).toBeVisible();
    }

    const metricCards = page.locator('[data-testid="dashboard-metric-cards"] > .ant-card');
    await expect(metricCards, '顶部应显示六个指标卡').toHaveCount(6);
    const topCardBoxes = await Promise.all(
      Array.from({ length: 6 }, async (_, index) => metricCards.nth(index).boundingBox()),
    );
    const topY = topCardBoxes[0]?.y ?? 0;
    for (const box of topCardBoxes) {
      expect(box, '顶部指标卡应全部可见').not.toBeNull();
      expect(Math.abs((box?.y ?? topY) - topY), '顶部六个指标卡应排在同一行').toBeLessThan(2);
    }

    await capturePage(page, '/work-orders?orderType=onboarding', '02-onboarding-work-orders');
    await expect(page).toHaveTitle(/入职主工单列表/);
    await expectPageText(page, '入职主工单列表');
    await expect(page.getByRole('button', { name: /新建入职工单/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /入职导入/ })).toBeVisible();

    await capturePage(page, '/work-orders?orderType=resignation', '03-resignation-work-orders');
    await expect(page).toHaveTitle(/离职主工单列表/);
    await expectPageText(page, '离职主工单列表');
    await expect(page.getByRole('button', { name: /新建离职工单/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /离职导入/ })).toBeVisible();

    await capturePage(page, '/notifications', '04-notifications');
    await expectPageText(page, '消息通知');
    await expect(page.getByText('消息中心用于集中处理工单提醒')).toHaveCount(0);

    await capturePage(page, '/admin/users', '05-admin-users');
    await expectPageText(page, '用户管理');

    await capturePage(page, '/admin/module-config', '06-admin-module-config');
    await expectPageText(page, '办理环节设置');

    await capturePage(page, '/admin/fields', '07-admin-fields');
    await expectPageText(page, '表单字段库');

    await capturePage(page, '/admin/dispatch-config', '08-admin-dispatch-config');
    await expectPageText(page, '负责人派发设置');
  });
});
