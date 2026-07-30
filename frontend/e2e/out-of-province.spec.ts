import { expect, test } from '@playwright/test';
import { loginAs, mockCommonApis } from './_helpers';

test('province scope switch persists and opens isolated out-of-province flows', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockCommonApis(page, 'admin');
  await loginAs(page, 'admin', 'admin');

  let listRequestUrl = '';
  await page.route('**/api/out-of-province-orders**', async (route) => {
    const requestUrl = route.request().url();
    if (route.request().method() === 'GET' && !requestUrl.includes('/import/')) {
      listRequestUrl = requestUrl;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          traceId: 'mock',
          data: {
            list: [{
              id: 'oop-1',
              order_no: 'OP-20260727-001',
              order_type: 'out_of_province_increase',
              businessScope: 'out_of_province',
              status: 'pending',
              province: '浙江省',
              customer_name: '省外测试客户',
              employee_name: '测试员工',
              created_at: '2026-07-27T08:00:00.000Z',
            }],
            page: 1,
            pageSize: 20,
            total: 1,
            totalPages: 1,
            success: true,
          },
        }),
      });
      return;
    }
    await route.abort();
  });

  await page.goto('/dashboard');
  await expect(page.getByRole('radio', { name: '北仑', exact: true })).toBeChecked();

  await page.locator('.ant-segmented-item-label', { hasText: '省外' }).click();

  await expect(page).toHaveURL(/\/out-of-province$/);
  await expect(page.getByText('省外增减员列表', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('OP-20260727-001')).toBeVisible();
  expect(new URL(listRequestUrl).searchParams.get('businessScope')).toBe('out_of_province');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('business_scope_v1')))
    .toBe('out_of_province');

  await page.reload();

  await expect(page).toHaveURL(/\/out-of-province$/);
  await expect(page.getByRole('radio', { name: '省外', exact: true })).toBeChecked();
  await expect(page.getByText('OP-20260727-001')).toBeVisible();

  await page.getByRole('button', { name: '省外增减员导入' }).click();
  await expect(page).toHaveURL(/\/out-of-province\/import$/);
  await expect(page.getByText('省外导入与北仑数据独立')).toBeVisible();

  await page.goto('/out-of-province/new');
  await expect(page.getByText('省外表单暂缓')).toBeVisible();
  await expect(page.getByText(/业务侧未提供菜鸟模板\/浙江自签字段清单/)).toBeVisible();

  await page.locator('.ant-segmented-item-label', { hasText: '北仑' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('business_scope_v1')))
    .toBe('beilun');
});
