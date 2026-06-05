import { expect, type Page } from '@playwright/test';

export async function loginAs(page: Page, username: string, role: string) {
  await page.addInitScript(({ name, roleCode }) => {
    localStorage.setItem('token', 'mock-token');
    localStorage.setItem('refresh_token', 'mock-refresh-token');
    localStorage.setItem('mock_session_user_v1', JSON.stringify({
      id: `user-${roleCode}`,
      username: name,
      real_name: name,
      email: '',
      phone: '',
      avatar_url: null,
      is_active: true,
      roles: [{ id: roleCode, code: roleCode, name: roleCode, level: 'member' }],
      permissions: roleCode === 'admin' ? ['*'] : [],
    }));
  }, { name: username, roleCode: role });
}

export async function mockCommonApis(page: Page, role: string) {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        traceId: 'mock',
        data: {
          id: `user-${role}`,
          username: role,
          real_name: role,
          email: '',
          phone: '',
          avatar_url: null,
          is_active: true,
          roles: [{ code: role, name: role, id: role, level: 'member' }],
          permissions: role === 'admin' ? ['*'] : [],
        },
      }),
    });
  });

  await page.route('**/api/auth/login', async (route) => {
    const body = await route.request().postDataJSON().catch(() => ({}));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        traceId: 'mock',
        data: {
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
          user: {
            id: `user-${body?.username || role}`,
            username: body?.username || role,
            realName: body?.username || role,
            roles: [{ code: role, name: role, id: role, level: 'member' }],
            permissions: role === 'admin' ? ['*'] : [],
          },
          roles: [{ code: role, name: role, id: role, level: 'member' }],
          permissions: role === 'admin' ? ['*'] : [],
        },
      }),
    });
  });

  await page.route('**/api/dashboard/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/cards')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok', traceId: 'mock', data: { totalPending: 1, monthPending: 1, totalThisMonth: 1, processing: 1, completed: 0, voided: 0, myMessages: 0 } }),
      });
      return;
    }
    if (url.includes('/order-type-matrix')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, message: 'ok', traceId: 'mock', data: { rows: [], total: 0 } }) });
      return;
    }
    if (url.includes('/leader-trend')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, message: 'ok', traceId: 'mock', data: { orderType: 'onboarding', moduleCode: null, buckets: [] } }) });
      return;
    }
    if (url.includes('/salesperson') || url.includes('/team/') || url.includes('/manager')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, message: 'ok', traceId: 'mock', data: {} }) });
      return;
    }
  });

  await page.route('**/api/admin/work-order-modules**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        traceId: 'mock',
        data: [
          { id: 'm-onboarding', module_code: 'onboarding', module_name: '入职管理', is_active: true },
          { id: 'm-resignation', module_code: 'resignation', module_name: '离职管理', is_active: true },
        ],
      }),
    });
  });

  await page.route('**/api/notifications**', async (route) => {
    const url = route.request().url();
    if (url.includes('/unread-count-by-bucket')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          traceId: 'mock',
          data: {
            total: 0,
            salesperson: { field_changed: 0, returned: 0, withdraw_void_result: 0, system: 0 },
            backend: { todo: 0, creator_modified: 0, withdraw_void_request: 0, system: 0 },
            system: 0,
          },
        }),
      });
      return;
    }
    if (url.includes('/unread-count')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, message: 'ok', traceId: 'mock', data: { count: 0 } }) });
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
          list: [],
          page: 1,
          pageSize: 50,
          total: 0,
          totalPages: 0,
          success: true,
        },
      }),
    });
  });
}
