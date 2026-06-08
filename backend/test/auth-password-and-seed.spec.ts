import * as bcrypt from 'bcrypt';
import { validateSync } from 'class-validator';
import { Repository } from 'typeorm';
import { Department, DispatchedOrder, Role, RoleLevel, User, UserRole } from 'src/entities';
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
    const service = new AuthService(userRepo, {} as never);

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
    const service = new AuthService(userRepo, {} as never);

    await expect(service.changePassword(user.id, 'old-password', 'new-password')).resolves.toEqual({ success: true });

    expect(user.passwordHash).not.toBe(oldHash);
    await expect(bcrypt.compare('new-password', user.passwordHash)).resolves.toBe(true);
    expect(user.mustChangePassword).toBe(false);
    expect(user.passwordUpdatedAt).toBeInstanceOf(Date);
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
});

describe('seedUsers password preservation', () => {
  it('does not overwrite password fields for existing users who already changed their password', async () => {
    const changedAt = new Date('2026-06-08T01:02:03.000Z');
    const customHash = await bcrypt.hash('user-custom-password', 10);
    const savedUsers: User[] = [];
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

    const userRepo = repoMock<User>({
      create: jest.fn((input: Partial<User>) => Object.assign(new User(), { id: `new-${input.username}` }, input)),
      findOne: jest.fn(async ({ where }: { where: { username: string } }) => existingUsers.get(where.username) ?? null),
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
      save: jest.fn(async (input: UserRole) => input),
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

    const maoyani = savedUsers.find((item) => item.username === 'maoyani');
    expect(maoyani).toBeDefined();
    expect(maoyani!.realName).toBe('毛雅妮');
    expect(maoyani!.passwordHash).toBe(customHash);
    expect(maoyani!.mustChangePassword).toBe(false);
    expect(maoyani!.passwordUpdatedAt).toBe(changedAt);
    await expect(bcrypt.compare('123456', maoyani!.passwordHash)).resolves.toBe(false);
  });
});
