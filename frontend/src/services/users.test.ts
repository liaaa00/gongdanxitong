import { describe, it, expect, beforeEach } from 'vitest';
import { validateUserCredentials, createUser } from './users';

describe('用户认证测试', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  it('应该能够验证管理员用户的密码', async () => {
    const lizhanbo = validateUserCredentials('lizhanbo', 'admin123');
    expect(lizhanbo).not.toBeNull();
    expect(lizhanbo?.username).toBe('lizhanbo');

    const wangzixi = validateUserCredentials('wangzixi', 'admin123');
    expect(wangzixi).not.toBeNull();
    expect(wangzixi?.username).toBe('wangzixi');
  });

  it('应该能够验证普通用户的密码', async () => {
    const aolei = validateUserCredentials('aolei', '123456');
    expect(aolei).not.toBeNull();
    expect(aolei?.username).toBe('aolei');

    const jianglu = validateUserCredentials('jianglu', '123456');
    expect(jianglu).not.toBeNull();
    expect(jianglu?.username).toBe('jianglu');
  });

  it('应该能够创建新用户并登录', async () => {
    const newUser = await createUser({
      username: 'test_user',
      real_name: '测试用户',
      email: 'test@example.com',
      phone: '13900000000',
      password: 'test123456',
      group_name: '测试团队',
      roles: [{ role_id: '4', role_name: '业务员' }],
    });

    expect(newUser.username).toBe('test_user');

    const validated = validateUserCredentials('test_user', 'test123456');
    expect(validated).not.toBeNull();
    expect(validated?.username).toBe('test_user');
  });

  it('应该拒绝错误的密码', () => {
    const result = validateUserCredentials('lizhanbo', 'wrong_password');
    expect(result).toBeNull();
  });

  it('应该拒绝不存在的用户', () => {
    const result = validateUserCredentials('nonexistent_user', 'any_password');
    expect(result).toBeNull();
  });

  it('所有种子用户都应该有密码', () => {
    const seedCredentials: Record<string, string> = {
      lizhanbo: 'admin123',
      wangzixi: 'admin123',
      aolei: '123456',
      xuekun: '123456',
      yuqinxia: '123456',
      shenwenjun: '123456',
      yaoyiping: '123456',
      yanqiuyue: '123456',
      chengyu: '123456',
      chenyuchen: '123456',
      zhouqiqing: '123456',
      wuyufei: '123456',
      gaolulu: '123456',
      zhaotianqi: '123456',
      liucheng: '123456',
      xujing: '123456',
      taomingyue: '123456',
      xujiayin: '123456',
      yuweiwei: '123456',
      zhangpuwei: '123456',
      annazhen: '123456',
      jianglu: '123456',
      yangchun: '123456',
      maoyani: '123456',
    };

    Object.entries(seedCredentials).forEach(([username, password]) => {
      const user = validateUserCredentials(username, password);
      expect(user, `用户 ${username} 应该能登录`).not.toBeNull();
      expect(user?.username).toBe(username);
    });
  });
});
