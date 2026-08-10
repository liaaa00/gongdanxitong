import { expect, test } from '@playwright/test';

const API_BASE = 'http://127.0.0.1:3000/api';

function fieldCode(field: Record<string, unknown>): string {
  return String(field.fieldCode ?? field.field_code ?? '');
}

function fieldName(field: Record<string, unknown>): string {
  return String(field.fieldName ?? field.field_name ?? '');
}

test.describe('导入模板字段配置 API', () => {
  let accessToken = '';

  test.beforeAll(async ({ request }) => {
    const response = await request.post(`${API_BASE}/auth/login`, {
      data: {
        username: 'lizhanbo',
        password: '123456',
        businessScope: 'beilun',
      },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    accessToken = body.data.accessToken;
  });

  test('字段库分页接口返回完整的入职字段元数据', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/admin/fields?page=1&pageSize=100&orderType=onboarding`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    const fields = body.data?.list ?? body.data?.items ?? [];
    expect(fields.length).toBeGreaterThan(20);
    expect(Number(body.data?.total ?? fields.length)).toBeGreaterThanOrEqual(fields.length);
    expect(fields.every((field: Record<string, unknown>) => fieldCode(field) && fieldName(field))).toBe(true);
  });

  test('当前入职导入模板配置非空、顺序稳定且字段不重复', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/work-orders/import/template-config?orderType=onboarding`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    const fields = Array.isArray(body.data) ? body.data : [];
    const codes = fields.map((field: Record<string, unknown>) => fieldCode(field));
    const orders = fields.map((field: Record<string, unknown>) => Number(field.displayOrder ?? field.display_order ?? 0));

    expect(fields.length).toBeGreaterThan(0);
    expect(new Set(codes).size).toBe(codes.length);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  test('可添加字段池覆盖当前模板字段且字段编码唯一', async ({ request }) => {
    const headers = { Authorization: `Bearer ${accessToken}` };
    const [configResponse, availableResponse] = await Promise.all([
      request.get(`${API_BASE}/work-orders/import/template-config?orderType=onboarding`, { headers }),
      request.get(`${API_BASE}/work-orders/import/template-config/available-fields?orderType=onboarding`, { headers }),
    ]);

    expect(configResponse.ok()).toBeTruthy();
    expect(availableResponse.ok()).toBeTruthy();

    const configBody = await configResponse.json();
    const availableBody = await availableResponse.json();
    const configuredCodes = (configBody.data ?? []).map((field: Record<string, unknown>) => fieldCode(field));
    const availableCodes = (availableBody.data ?? []).map((field: Record<string, unknown>) => fieldCode(field));
    const availableSet = new Set(availableCodes);

    expect(availableCodes.length).toBeGreaterThan(0);
    expect(new Set(availableCodes).size).toBe(availableCodes.length);
    expect(configuredCodes.every((code: string) => availableSet.has(code))).toBe(true);
  });

  test('服务器模板下载字段数与当前模板配置一致', async ({ request }) => {
    const headers = { Authorization: `Bearer ${accessToken}` };
    const configResponse = await request.get(
      `${API_BASE}/work-orders/import/template-config?orderType=onboarding`,
      { headers },
    );
    expect(configResponse.ok()).toBeTruthy();
    const configBody = await configResponse.json();
    const configuredCount = Array.isArray(configBody.data) ? configBody.data.length : 0;

    const response = await request.get(
      `${API_BASE}/work-orders/import/template?orderType=onboarding`,
      { headers },
    );

    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(Number(response.headers()['x-field-count'])).toBe(configuredCount);
    expect((await response.body()).byteLength).toBeGreaterThan(1000);
  });
});
