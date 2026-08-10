import { readFile } from 'node:fs/promises';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import * as XLSXModule from 'xlsx';

const XLSX = (XLSXModule as any).default ?? XLSXModule;

const API_BASE = 'http://127.0.0.1:3000/api';

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('input[id="username"]', 'lizhanbo');
  await page.fill('input[id="password"]', '123456');
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await page.waitForURL('**/dashboard', { timeout: 10000 });
}

async function getAccessToken(request: APIRequestContext): Promise<string> {
  const response = await request.post(`${API_BASE}/auth/login`, {
    data: { username: 'lizhanbo', password: '123456', businessScope: 'beilun' },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).data.accessToken;
}

function codeOf(field: Record<string, unknown>): string {
  return String(field.fieldCode ?? field.field_code ?? '');
}

function headerOf(field: Record<string, unknown>): string {
  return String(
    field.headerAlias
    ?? field.header_alias
    ?? field.fieldName
    ?? field.field_name
    ?? '',
  );
}

async function configuredHeaders(
  request: APIRequestContext,
  orderType: 'onboarding' | 'resignation',
): Promise<{ token: string; headers: string[] }> {
  const token = await getAccessToken(request);
  const response = await request.get(
    `${API_BASE}/work-orders/import/template-config?orderType=${orderType}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  const fields = Array.isArray(body.data) ? body.data : [];
  expect(new Set(fields.map((field: Record<string, unknown>) => codeOf(field))).size).toBe(fields.length);
  return { token, headers: fields.map((field: Record<string, unknown>) => headerOf(field)) };
}

async function verifyDownloadedTemplate(
  page: Page,
  request: APIRequestContext,
  orderType: 'onboarding' | 'resignation',
  label: '入职' | '离职',
): Promise<void> {
  const { headers: expectedHeaders } = await configuredHeaders(request, orderType);
  await page.goto(`/work-orders/import?orderType=${orderType}`);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '下载当前字段模板' }).click(),
  ]);
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  expect(download.suggestedFilename()).toContain(`${label}导入模板`);

  const workbook = XLSX.read(await readFile(downloadPath!), { type: 'buffer' });
  expect(workbook.SheetNames).toContain('当前字段配置');
  const sheet = workbook.Sheets['当前字段配置'];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false });
  const headerRow = rows.find((row) => String(row[0] ?? '') === '字段名');
  expect(headerRow).toBeTruthy();
  const actualHeaders = (headerRow ?? []).slice(1, expectedHeaders.length + 1).map(String);

  expect(actualHeaders).toEqual(expectedHeaders);
}

test.describe('服务器导入模板文件', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsAdmin(page);
  });

  test('入职模板列与当前模板配置完全一致', async ({ page, request }) => {
    await verifyDownloadedTemplate(page, request, 'onboarding', '入职');
  });

  test('离职模板列与当前模板配置完全一致', async ({ page, request }) => {
    await verifyDownloadedTemplate(page, request, 'resignation', '离职');
  });

  test('入职和离职模板配置相互独立', async ({ request }) => {
    const onboarding = await configuredHeaders(request, 'onboarding');
    const resignation = await configuredHeaders(request, 'resignation');

    expect(onboarding.headers.length).toBeGreaterThan(resignation.headers.length);
    expect(onboarding.headers).not.toEqual(resignation.headers);
  });
});
