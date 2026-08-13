import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { BusinessScope, OperationLog, User } from 'src/entities';
import { AuthService } from 'src/modules/auth/auth.service';

function createService(user: User) {
  const userRepository = {
    findOne: jest.fn(async () => user),
    save: jest.fn(async (input: User) => input),
  } as unknown as Repository<User>;
  const operationLogRepository = {
    create: jest.fn((input) => input),
    save: jest.fn(async (input) => input),
  } as unknown as Repository<OperationLog>;
  const jwtService = {
    signAsync: jest.fn(async () => 'signed-token'),
  };
  const roleActionPermissionService = {
    getAllowedActionsForRoles: jest.fn(async () => []),
  };

  return {
    service: new AuthService(
      {} as never,
      userRepository,
      operationLogRepository,
      jwtService as never,
      roleActionPermissionService as never,
    ),
    userRepository,
    jwtService,
  };
}

async function makeUser(roleCode: string, businessScope: BusinessScope): Promise<User> {
  return Object.assign(new User(), {
    id: 'user-1',
    username: 'scope-user',
    realName: 'Scope User',
    email: null,
    phone: null,
    passwordHash: await bcrypt.hash('123456', 4),
    businessScope,
    isActive: true,
    failedLoginAttempts: 0,
    lockedUntil: null,
    authVersion: 0,
    mustChangePassword: false,
    userRoles: [{
      role: {
        code: roleCode,
        isActive: true,
      },
    }],
  });
}

describe('unified login business-scope routing', () => {
  it.each([
    ['business_group_member', BusinessScope.OUT_OF_PROVINCE],
    ['labor_contract_member', BusinessScope.BEILUN],
  ])('authenticates %s through the unified endpoint and returns the database scope', async (roleCode, businessScope) => {
    const user = await makeUser(roleCode, businessScope);
    const { service, userRepository, jwtService } = createService(user);

    await expect(service.login(
      user.username,
      '123456',
      '127.0.0.1',
    )).resolves.toMatchObject({
      user: {
        businessScope,
        business_scope: businessScope,
      },
    });

    expect(userRepository.save).toHaveBeenCalledWith(user);
    expect(jwtService.signAsync).toHaveBeenCalled();
  });
});
