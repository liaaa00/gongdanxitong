import * as bcrypt from 'bcrypt';
import { validateSync } from 'class-validator';
import { Repository } from 'typeorm';
import { Department, DispatchedOrder, OperationLog, Role, RoleLevel, User, UserRole } from 'src/entities';
import { UsersService } from 'src/modules/admin/users/users.service';
import { AuthService } from 'src/modules/auth/auth.service';
import { ChangePasswordDto } from 'src/modules/auth/dto/change-password.dto';
import { seedUsers } from 'src/database/seeds/seed-users';

function repoMock<T extends object>(overrides: Partial<Record<string, unknown>> = {}): Repository<T> {
  return {
    create: jest.fn((input: Partial<T>) => input as T),
    save: jest.fn(async (input: T) => input),
    findOne: jest.fn(async () => null),
    findOneOrFail: jest.fn(async () => { throw new Error('not mocked'); }),
    find: jest.fn(async () => []),
    count: jest.fn(async () => 0),
    delete: jest.fn(async () => ({ affected: 1 })),
    ...overrides,
  } as unknown as Repository<T>;
}

const roleActionPermissionServiceMock = {
  getAllowedActionsForRoles: jest.fn(async () => []),
};

function createAuthService(userRepo: Repository<User>) {
  const manager = {
    findOne: jest.fn(async (_entity: unknown, options: unknown) => userRepo.findOne(options as never)),
    save: jest.fn(async (_entity: unknown, input: User) => userRepo.save(input)),
  };
  const dataSource = {
    transaction: jest.fn(async (callback: (entityManager: typeof manager) => unknown) => callback(manager)),
  };
  return {
    service: new AuthService(
      dataSource as never,
      userRepo,
      repoMock<OperationLog>(),
      {} as never,
      roleActionPermissionServiceMock as never,
    ),
    manager,
  };
}

describe('change password contract', () => {
  it('validates oldPassword/newPassword DTO fields and rejects legacy field names', () => {
    const validDto = Object.assign(new ChangePasswordDto(), {
      oldPassword: '123456',
      newPassword: 'abcdef',
    });
    expect(validateSync(validDto)).toHaveLength(0);

    const legacyDto = Object.assign(new ChangePasswordDto(), {
      old_password: '123456',
      password: 'abcdef',
    });
    const errors = validateSync(legacyDto);
    expect(errors.map((error) => error.property).sort()).toEqual(['newPassword', 'oldPassword']);
  });

  it('me returns mustChangePassword in both camelCase and snake_case for login-state guards', async () => {
    const user = Object.assign(new User(), {
      id: 'u-me',
      username: 'jianglu',
      realName: '江璐',
      email: 'jianglu@example.com',
      phone: null,
      isActive: true,
      lastLoginAt: null,
      mustChangePassword: true,
      userRoles: [],
    });
    const userRepo = repoMock<User>({ findOne: jest.fn(async () => user) });
    const { service } = createAuthService(userRepo);

    await expect(service.me(user.id)).resolves.toMatchObject({
      mustChangePassword: true,
      must_change_password: true,
    });
  });

  it('saves passwordHash, clears mustChangePassword and updates passwordUpdatedAt after user changes password', async () => {
    const oldHash = await bcrypt.hash('old-password', 10);
    const user = Object.assign(new User(), {
      id: 'u-1',
      username: 'maoyani',
      realName: '毛雅妮',
      email: 'maoyani@example.com',
      phone: null,
      passwordHash: oldHash,
      mustChangePassword: true,
      passwordUpdatedAt: null,
      isActive: true,
    });
    const userRepo = repoMock<User>({
      findOne: jest.fn(async () => user),
      save: jest.fn(async (input: User) => input),
    });
    const { service, manager } = createAuthService(userRepo);

    await expect(service.changePassword(user.id, 'old-password', 'new-password')).resolves.toEqual({ success: true });

    expect(user.passwordHash).not.toBe(oldHash);
    await expect(bcrypt.compare('new-password', user.passwordHash)).resolves.toBe(true);
    expect(user.mustChangePassword).toBe(false);
    expect(user.passwordUpdatedAt).toBeInstanceOf(Date);
    expect(manager.save).toHaveBeenCalledWith(User, user);
    expect(userRepo.save).toHaveBeenCalledWith(user);
  });
});

describe('admin password reset contract', () => {
  it('allows admin reset while returning no plaintext password or hash', async () => {
    const oldHash = await bcrypt.hash('old-password', 10);
    const user = Object.assign(new User(), {
      id: 'u-2',
      username: 'jianglu',
      realName: '江璐',
      email: 'jianglu@example.com',
      phone: null,
      passwordHash: oldHash,
      isActive: true,
    });
    const userRepo = repoMock<User>({
      findOne: jest.fn(async () => user),
      save: jest.fn(async (input: User) => input),
    });
    const service = new UsersService(
      {} as never,
      userRepo,
      repoMock<Role>(),
      repoMock<Department>(),
      repoMock<UserRole>(),
      repoMock<DispatchedOrder>(),
    );

    const result = await service.resetPassword(user.id, 'admin-reset-password');

    expect(result).toEqual({ success: true });
    expect(JSON.stringify(result)).not.toContain('admin-reset-password');
    expect(JSON.stringify(result)).not.toContain('passwordHash');
    expect(user.passwordHash).not.toBe(oldHash);
    await expect(bcrypt.compare('admin-reset-password', user.passwordHash)).resolves.toBe(true);
    expect(user.mustChangePassword).toBe(true);
    expect(user.passwordUpdatedAt).toBeNull();
    expect(userRepo.save).toHaveBeenCalledWith(user);
  });

  it('allows admin user edit to update password when password is provided', async () => {
    const oldHash = await bcrypt.hash('old-password', 10);
    const user = Object.assign(new User(), {
      id: 'u-3',
      username: 'taomingyue',
      realName: '陶明月',
      email: 'taomingyue@example.com',
      phone: null,
      avatarUrl: null,
      passwordHash: oldHash,
      mustChangePassword: false,
      passwordUpdatedAt: new Date('2026-07-01T00:00:00.000Z'),
      isActive: true,
      userRoles: [],
    });
    const userRepo = repoMock<User>({
      findOne: jest.fn(async () => user),
      save: jest.fn(async (input: User) => input),
    });
    const service = new UsersService(
      {} as never,
      userRepo,
      repoMock<Role>(),
      repoMock<Department>(),
      repoMock<UserRole>(),
      repoMock<DispatchedOrder>(),
    );

    const result = await service.update(user.id, { real_name: '陶明月', password: 'edited-password' });

    expect(result.username).toBe('taomingyue');
    expect(JSON.stringify(result)).not.toContain('edited-password');
    expect(JSON.stringify(result)).not.toContain('passwordHash');
    expect(user.passwordHash).not.toBe(oldHash);
    await expect(bcrypt.compare('edited-password', user.passwordHash)).resolves.toBe(true);
    expect(user.mustChangePassword).toBe(true);
    expect(user.passwordUpdatedAt).toBeNull();
    expect(userRepo.save).toHaveBeenCalledWith(user);
  });
  it('updates username and real name without rewriting role bindings', async () => {
    const user = Object.assign(new User(), {
      id: 'u-rename',
      username: 'taomingyue',
      realName: '陶明月',
      email: 'taomingyue@example.com',
      phone: null,
      avatarUrl: null,
      passwordHash: 'unchanged-hash',
      isActive: true,
      userRoles: [],
    });
    const transaction = jest.fn();
    const userRepo = repoMock<User>({
      findOne: jest.fn(async ({ where }: { where: { id?: string; username?: string } }) => {
        if (where.username) return null;
        return where.id === user.id ? user : null;
      }),
      save: jest.fn(async (input: User) => input),
    });
    const service = new UsersService(
      { transaction } as never,
      userRepo,
      repoMock<Role>(),
      repoMock<Department>(),
      repoMock<UserRole>(),
      repoMock<DispatchedOrder>(),
    );

    const result = await service.update(user.id, {
      username: 'taomingyue_new',
      real_name: '陶明月新',
    });

    expect(result).toMatchObject({ username: 'taomingyue_new', real_name: '陶明月新' });
    expect(user.passwordHash).toBe('unchanged-hash');
    expect(userRepo.save).toHaveBeenCalledWith(user);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a duplicate username before saving any user changes', async () => {
    const current = Object.assign(new User(), {
      id: 'u-current',
      username: 'taomingyue',
      realName: '陶明月',
      email: 'taomingyue@example.com',
      phone: null,
      avatarUrl: null,
      passwordHash: 'unchanged-hash',
      isActive: true,
      userRoles: [],
    });
    const duplicate = Object.assign(new User(), {
      id: 'u-duplicate',
      username: 'existing_user',
    });
    const save = jest.fn(async (input: User) => input);
    const userRepo = repoMock<User>({
      findOne: jest.fn(async ({ where }: { where: { id?: string; username?: string } }) => {
        if (where.username === duplicate.username) return duplicate;
        return where.id === current.id ? current : null;
      }),
      save,
    });
    const service = new UsersService(
      {} as never,
      userRepo,
      repoMock<Role>(),
      repoMock<Department>(),
      repoMock<UserRole>(),
      repoMock<DispatchedOrder>(),
    );

    await expect(service.update(current.id, {
      username: duplicate.username,
      real_name: '不应保存',
    })).rejects.toThrow('用户名已存在');

    expect(current).toMatchObject({
      username: 'taomingyue',
      realName: '陶明月',
    });
    expect(save).not.toHaveBeenCalled();
  });
});

describe('seedUsers password preservation', () => {
  it('does not overwrite password fields for existing users who already changed their password', async () => {
    const changedAt = new Date('2026-06-08T01:02:03.000Z');
    const customHash = await bcrypt.hash('user-custom-password', 10);
    const savedUsers: User[] = [];
    const savedUserRoles: UserRole[] = [];
    const existingUsers = new Map<string, User>();
    existingUsers.set('maoyani', Object.assign(new User(), {
      id: 'user-maoyani',
      username: 'maoyani',
      realName: '旧毛雅妮',
      email: 'old-maoyani@example.com',
      phone: '13000000000',
      passwordHash: customHash,
      mustChangePassword: false,
      passwordUpdatedAt: changedAt,
      isActive: true,
    }));
    existingUsers.set('taomingyue_new', Object.assign(new User(), {
      id: 'user-taomingyue-renamed',
      username: 'taomingyue_new',
      realName: '陶明月',
      email: 'taomingyue@example.com',
      phone: '13800000017',
      passwordHash: customHash,
      mustChangePassword: false,
      passwordUpdatedAt: changedAt,
      isActive: true,
    }));

    const userRepo = repoMock<User>({
      create: jest.fn((input: Partial<User>) => Object.assign(new User(), { id: `new-${input.username}` }, input)),
      findOne: jest.fn(async ({ where }: { where: { username?: string; email?: string } }) => {
        if (where.username) return existingUsers.get(where.username) ?? null;
        if (where.email) {
          return Array.from(existingUsers.values()).find((user) => user.email === where.email) ?? null;
        }
        return null;
      }),
      findOneOrFail: jest.fn(async ({ where }: { where: { username: string } }) => {
        const user = existingUsers.get(where.username);
        if (!user) throw new Error(`missing user ${where.username}`);
        return user;
      }),
      save: jest.fn(async (input: User) => {
        savedUsers.push(input);
        existingUsers.set(input.username, input);
        return input;
      }),
    });
    const roleRepo = repoMock<Role>({
      findOne: jest.fn(async ({ where }: { where: { code: string } }) => Object.assign(new Role(), {
        id: `role-${where.code}`,
        code: where.code,
        name: where.code,
        level: RoleLevel.EXECUTION,
        isActive: true,
      })),
    });
    const departmentRepo = repoMock<Department>({
      findOne: jest.fn(async ({ where }: { where: { code: string } }) => Object.assign(new Department(), {
        id: `dept-${where.code}`,
        code: where.code,
        name: where.code,
        isActive: true,
      })),
    });
    const userRoleRepo = repoMock<UserRole>({
      create: jest.fn((input: Partial<UserRole>) => input as UserRole),
      save: jest.fn(async (input: UserRole) => {
        savedUserRoles.push(input);
        return input;
      }),
      delete: jest.fn(async () => ({ affected: 1 })),
    });
    const dataSource = {
      query: jest.fn(async () => []),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === User) return userRepo;
        if (entity === Role) return roleRepo;
        if (entity === Department) return departmentRepo;
        if (entity === UserRole) return userRoleRepo;
        throw new Error('unexpected repository');
      }),
    } as never;

    await seedUsers(dataSource);

    const maoyani = existingUsers.get('maoyani');
    expect(maoyani).toBeDefined();
    expect(savedUsers.some((item) => item.username === 'maoyani')).toBe(false);
    expect(maoyani!.passwordHash).toBe(customHash);
    expect(maoyani!.mustChangePassword).toBe(false);
    expect(maoyani!.passwordUpdatedAt).toBe(changedAt);
    await expect(bcrypt.compare('123456', maoyani!.passwordHash)).resolves.toBe(false);
    expect(existingUsers.has('taomingyue')).toBe(false);
    expect(savedUsers.some((item) => item.username === 'taomingyue')).toBe(false);
    expect(savedUserRoles).toContainEqual(expect.objectContaining({
      userId: 'user-taomingyue-renamed',
      roleId: 'role-biz_member',
      departmentId: 'dept-BUSINESS_GROUP_4',
    }));
  });
});
