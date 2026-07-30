import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { OperationLog, Role, RoleLevel, User, UserRole } from 'src/entities';
import { PasswordChangeGuard } from 'src/common/guards/password-change.guard';
import { AuthService } from 'src/modules/auth/auth.service';
import { JwtStrategy } from 'src/modules/auth/strategies/jwt.strategy';

function repo<T extends object>(overrides: Partial<Record<keyof Repository<T>, unknown>> = {}): Repository<T> {
  return {
    create: jest.fn((input: Partial<T>) => input as T),
    save: jest.fn(async (input: T) => input),
    findOne: jest.fn(async () => null),
    increment: jest.fn(async () => ({ affected: 1 })),
    ...overrides,
  } as unknown as Repository<T>;
}

function roleBinding(code: string): UserRole {
  return Object.assign(new UserRole(), {
    role: Object.assign(new Role(), { code, name: code, level: RoleLevel.EXECUTION, isActive: true }),
  });
}

function createService(userRepo: Repository<User>, jwtOverrides: Record<string, jest.Mock> = {}) {
  const jwtService = {
    verifyAsync: jest.fn(),
    signAsync: jest.fn(async () => 'signed-token'),
    ...jwtOverrides,
  };
  const logRepo = repo<OperationLog>();
  return {
    service: new AuthService(
      { transaction: jest.fn() } as never,
      userRepo,
      logRepo,
      jwtService as never,
      { getAllowedActionsForRoles: jest.fn(async () => []) } as never,
    ),
    jwtService,
    logRepo,
  };
}

describe('authentication session security', () => {
  it('refreshes from current active user roles instead of stale token roles', async () => {
    const user = Object.assign(new User(), {
      id: '00000000-0000-0000-0000-000000000101',
      username: 'handler01',
      realName: '处理人',
      isActive: true,
      authVersion: 3,
      mustChangePassword: false,
      userRoles: [roleBinding('current_role')],
    });
    const userRepo = repo<User>({ findOne: jest.fn(async () => user) });
    const { service, jwtService } = createService(userRepo, {
      verifyAsync: jest.fn(async () => ({
        sub: user.id,
        username: user.username,
        roles: ['stale_role'],
        authVersion: 3,
        mustChangePassword: false,
      })),
    });

    await expect(service.refresh('refresh-token')).resolves.toEqual({ accessToken: 'signed-token' });
    expect(jwtService.signAsync).toHaveBeenCalledWith(expect.objectContaining({
      roles: ['current_role'],
      authVersion: 3,
    }));
  });

  it('rejects refresh when the user is inactive or the session version changed', async () => {
    const userRepo = repo<User>({ findOne: jest.fn(async () => null) });
    const { service } = createService(userRepo, {
      verifyAsync: jest.fn(async () => ({
        sub: '00000000-0000-0000-0000-000000000102',
        username: 'disabled',
        roles: ['admin'],
        authVersion: 0,
        mustChangePassword: false,
      })),
    });

    await expect(service.refresh('refresh-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('locks an account after the configured number of failed passwords', async () => {
    const user = Object.assign(new User(), {
      id: '00000000-0000-0000-0000-000000000103',
      username: 'locked-user',
      realName: '锁定用户',
      passwordHash: await bcrypt.hash('correct-password', 4),
      isActive: true,
      authVersion: 0,
      failedLoginAttempts: 4,
      lockedUntil: null,
      userRoles: [],
    });
    const userRepo = repo<User>({
      findOne: jest.fn(async () => user),
      save: jest.fn(async (input: User) => input),
    });
    const { service } = createService(userRepo);

    await expect(service.login(user.username, 'wrong-password')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(user.failedLoginAttempts).toBe(5);
    expect(user.lockedUntil).toBeInstanceOf(Date);
    expect(userRepo.save).toHaveBeenCalledWith(user);
  });

  it('increments the session version on logout', async () => {
    const userRepo = repo<User>();
    const { service } = createService(userRepo);
    const userId = '00000000-0000-0000-0000-000000000104';

    await expect(service.logout(userId)).resolves.toEqual({ success: true });
    expect(userRepo.increment).toHaveBeenCalledWith({ id: userId }, 'authVersion', 1);
  });
});

describe('JWT and first-login guards', () => {
  it('JWT strategy returns current roles and first-login state from the database', async () => {
    const user = Object.assign(new User(), {
      id: '00000000-0000-0000-0000-000000000105',
      username: 'first-login',
      realName: '首次登录',
      isActive: true,
      authVersion: 2,
      mustChangePassword: true,
      userRoles: [roleBinding('business_group_member')],
    });
    const strategy = new JwtStrategy(
      { get: jest.fn(() => 'test-secret') } as never,
      repo<User>({ findOne: jest.fn(async () => user) }),
    );

    await expect(strategy.validate({
      sub: user.id,
      username: user.username,
      roles: ['stale_role'],
      authVersion: 2,
      mustChangePassword: false,
    })).resolves.toMatchObject({
      roles: ['business_group_member'],
      mustChangePassword: true,
      authVersion: 2,
    });
  });

  it('blocks ordinary endpoints until the initial password is changed', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    const guard = new PasswordChangeGuard(reflector as never);
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: { mustChangePassword: true } }),
      }),
    };

    expect(() => guard.canActivate(context as never)).toThrow('请先修改初始密码');
  });
});
