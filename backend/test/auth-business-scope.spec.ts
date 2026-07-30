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
    realName: '业务线测试用户',
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

describe('login business-scope boundary', () => {
  it('rejects a Zhejiang business-front account at the Beilun entry', async () => {
    const user = await makeUser('business_group_member', BusinessScope.OUT_OF_PROVINCE);
    const { service, jwtService } = createService(user);

    await expect(service.login(
      user.username,
      '123456',
      '127.0.0.1',
      BusinessScope.BEILUN,
    )).rejects.toThrow('该账号属于浙江自签业务，请从浙江自签入口登录');

    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('allows a backend handler to use either entry and returns the database scope', async () => {
    const user = await makeUser('labor_contract_member', BusinessScope.OUT_OF_PROVINCE);
    const { service, userRepository } = createService(user);

    await expect(service.login(
      user.username,
      '123456',
      '127.0.0.1',
      BusinessScope.BEILUN,
    )).resolves.toMatchObject({
      user: {
        businessScope: BusinessScope.OUT_OF_PROVINCE,
        business_scope: BusinessScope.OUT_OF_PROVINCE,
      },
    });

    expect(userRepository.save).toHaveBeenCalledWith(user);
  });
});
