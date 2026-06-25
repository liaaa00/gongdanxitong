import { expect, test, type Page } from '@playwright/test';
import { loginAs, mockCommonApis } from './_helpers';

async function mockImportApis(page: Page) {
  await page.route('**/api/upload/excel', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, message: 'ok', traceId: 'mock', data: { id: 'file-excel-1', fileId: 'file-excel-1', filename: 'demo.xlsx', size: 100 } }) });
  });

  await page.route('**/api/admin/fields**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        traceId: 'mock',
        data: {
          list: [
            { id: '1', field_code: 'employee_name', field_name: '姓名', field_type: 'text', is_required: true, order_type: 'onboarding', display_order: 1, is_active: true },
            { id: '2', field_code: 'id_card_no', field_name: '身份证号', field_type: 'text', is_required: true, order_type: 'onboarding', display_order: 2, is_active: true },
            { id: '3', field_code: 'customer_name', field_name: '客户名称', field_type: 'text', is_required: true, order_type: 'onboarding', display_order: 3, is_active: true },
            { id: '4', field_code: 'position', field_name: '岗位', field_type: 'text', is_required: true, order_type: 'onboarding', display_order: 4, is_active: true },
            { id: '5', field_code: 'mobile', field_name: '手机号', field_type: 'text', is_required: true, order_type: 'onboarding', display_order: 5, is_active: true },
            { id: '6', field_code: 'email', field_name: '邮箱', field_type: 'text', is_required: true, order_type: 'onboarding', display_order: 6, is_active: true },
            { id: '7', field_code: 'current_address', field_name: '现住地址', field_type: 'text', is_required: true, order_type: 'onboarding', display_order: 7, is_active: true },
          ],
          page: 1,
          pageSize: 100,
          total: 7,
          totalPages: 1,
          success: true,
        },
      }),
    });
  });

  await page.route('**/api/work-orders/import/preview', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        traceId: 'mock',
        data: {
          fileId: 'file-excel-1',
          mapping: [
            { excelColumn: '姓名', systemFieldCode: 'employee_name', systemFieldName: '姓名', confidence: 0.99 },
            { excelColumn: '身份证号', systemFieldCode: 'id_card_no', systemFieldName: '身份证号', confidence: 0.98 },
            { excelColumn: '客户名称', systemFieldCode: 'customer_name', systemFieldName: '客户名称', confidence: 0.97 },
            { excelColumn: '岗位', systemFieldCode: 'position', systemFieldName: '岗位', confidence: 0.96 },
            { excelColumn: '手机号', systemFieldCode: 'mobile', systemFieldName: '手机号', confidence: 0.95 },
            { excelColumn: '邮箱', systemFieldCode: 'email', systemFieldName: '邮箱', confidence: 0.94 },
            { excelColumn: '现住地址', systemFieldCode: 'current_address', systemFieldName: '现住地址', confidence: 0.93 },
          ],
          availableFields: [
            { field_code: 'employee_name', field_name: '姓名', is_required: true },
            { field_code: 'id_card_no', field_name: '身份证号', is_required: true },
            { field_code: 'customer_name', field_name: '客户名称', is_required: true },
            { field_code: 'position', field_name: '岗位', is_required: true },
            { field_code: 'mobile', field_name: '手机号', is_required: true },
            { field_code: 'email', field_name: '邮箱', is_required: true },
            { field_code: 'current_address', field_name: '现住地址', is_required: true },
          ],
          suggestedMapping: { 姓名: 'employee_name', 身份证号: 'id_card_no', 客户名称: 'customer_name', 岗位: 'position', 手机号: 'mobile', 邮箱: 'email', 现住地址: 'current_address' },
          totalRows: 2,
          previewRows: [{ 姓名: '张三', 身份证号: '330106199001011234', 客户名称: '浙江企服', 岗位: '工程师', 手机号: '13800138000', 邮箱: 'demo@example.com', 现住地址: '杭州' }],
          missingRequired: [],
          unmatched: [],
          unmatchedHeaders: [],
          modelUsed: 'fallback:rule',
          fallbackReason: null,
        },
      }),
    });
  });

  await page.route('**/api/work-orders/import/confirm', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        traceId: 'mock',
        data: {
          id: 'job-import-001',
          total_rows: 2,
          success_rows: 2,
          fail_rows: 0,
          warning_rows: 0,
          processed_rows: 2,
          status: 'completed',
          error_report_url: null,
          validation_errors: [],
          top_errors: [],
          warning_details: [],
          warnings: [],
          error_message: null,
          detail_messages: [],
          partial: false,
        },
      }),
    });
  });

  await page.route('**/api/work-orders/import/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/error-report')) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 404, message: 'not found', data: null }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        traceId: 'mock',
        data: {
          id: 'job-import-001',
          total_rows: 2,
          success_rows: 2,
          fail_rows: 0,
          processed_rows: 2,
          status: 'completed',
          error_report_url: null,
          validation_errors: [],
          warning_details: [],
          warnings: [],
          partial: false,
        },
      }),
    });
  });
}

function createWorkbookBlob() {
  return {
    name: 'demo.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from('mock-xlsx'),
  };
}

test('import flow smoke', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockCommonApis(page, 'admin');
  await mockImportApis(page);
  await loginAs(page, 'lizhanbo', 'admin');

  await page.goto('/work-orders/import?orderType=onboarding');
  await expect(page.getByText('入职导入')).toBeVisible();
  await expect(page.getByRole('button', { name: '下载当前字段模板' })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles(createWorkbookBlob());
  await expect(page.getByText('字段校验')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('数据预览')).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: '验证并导入' }).click();
  await expect(page.getByText('结果')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('导入成功！工单已进入派发流程。')).toBeVisible();
  await expect(page.getByText('job-import-001')).toBeVisible();
});
