import { http } from 'msw';
import { fail, ok } from '../utils';

if (!import.meta.env.DEV) {
  throw new Error('mocks/handlers/auth must not be bundled in production');
}

const adminUser = {
  id: 'mock-admin-1',
  username: 'lizhanbo',
  realName: '李占博',
  roles: [{ code: 'admin', name: '系统管理员' }],
  permissions: ['*'],
};

export const authHandlers = [
  http.post('/api/auth/login', async ({ request }) => {
    const body = (await request.json()) as { username?: string; password?: string };
    const adminUsers = ['admin', 'lizhanbo', 'wangzixi'];
    if (adminUsers.includes(body.username ?? '') && ['admin123', 'Admin123456!'].includes(body.password ?? '')) {
      return ok({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        user: { ...adminUser, username: body.username },
      });
    }
    if ((body.password ?? '') === '123456') {
      return ok({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        user: {
          id: 'mock-user-1',
          username: body.username,
          realName: body.username,
          roles: [{ code: 'business_group_member', name: '业务员' }],
          permissions: [],
        },
      });
    }
    return fail(2001, '用户名或密码错误', 401);
  }),

  http.get('/api/auth/me', ({ request }) => {
    const authorization = request.headers.get('authorization');
    if (!authorization) {
      return fail(2000, '未登录或令牌已失效', 401);
    }
    return ok(adminUser);
  }),

  http.post('/api/auth/refresh', async ({ request }) => {
    const body = (await request.json()) as { refreshToken?: string };
    if (body.refreshToken !== 'mock-refresh-token') {
      return fail(2001, 'refresh token 无效或已过期', 401);
    }
    return ok({ accessToken: 'mock-access-token-refreshed' });
  }),

  http.post('/api/auth/change-password', async ({ request }) => {
    const body = (await request.json()) as { oldPassword?: string; newPassword?: string };
    if (!body.oldPassword || !body.newPassword) {
      return fail(400, 'oldPassword/newPassword 必填', 400);
    }
    return ok({ success: true }, '密码修改成功');
  }),
];
