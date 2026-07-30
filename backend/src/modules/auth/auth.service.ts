import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import { BusinessScope, OperationLog, User } from 'src/entities';
import { RoleActionPermissionService } from 'src/modules/role-action-permissions/role-action-permission.service';
import { JwtUserPayload, LoginResult } from './auth.types';

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const BUSINESS_FRONT_ROLE_CODES = new Set([
  'business_owner',
  'business_group_leader',
  'business_group_member',
  'biz_manager',
  'biz_leader',
  'biz_member',
  'manager',
  'salesperson',
]);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly maxLoginAttempts = Math.max(1, Number(process.env.LOGIN_MAX_ATTEMPTS ?? 5));
  private readonly lockMinutes = Math.max(1, Number(process.env.LOGIN_LOCK_MINUTES ?? 15));

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(OperationLog)
    private readonly operationLogRepository: Repository<OperationLog>,
    private readonly jwtService: JwtService,
    private readonly roleActionPermissionService: RoleActionPermissionService,
  ) {}

  private async buildUserPermissions(roleCodes: string[]): Promise<string[]> {
    const actions = await this.roleActionPermissionService.getAllowedActionsForRoles(roleCodes);
    return Array.from(new Set([
      ...roleCodes.map((code) => `role:${code}`),
      ...actions,
    ]));
  }

  private getActiveRoleCodes(user: User): string[] {
    return Array.from(new Set(
      (user.userRoles ?? [])
        .filter((binding) => binding.role?.isActive)
        .map((binding) => binding.role.code),
    ));
  }

  private createJwtPayload(user: User, roles: string[]): JwtUserPayload {
    return {
      sub: user.id,
      username: user.username,
      realName: user.realName,
      real_name: user.realName,
      roles,
      businessScope: user.businessScope ?? BusinessScope.BEILUN,
      authVersion: user.authVersion ?? 0,
      mustChangePassword: user.mustChangePassword,
    };
  }

  async login(
    username: string,
    password: string,
    ipAddress?: string,
    requestedBusinessScope?: BusinessScope,
  ): Promise<LoginResult> {
    const user = await this.userRepository.findOne({
      where: { username },
      relations: { userRoles: { role: true } },
    });

    if (!user || !user.isActive) {
      await this.writeSecurityLog('login_failed', user?.id, ipAddress, {
        reason: user ? 'inactive_user' : 'invalid_credentials',
        username,
      });
      throw new UnauthorizedException('用户名或密码错误');
    }

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil.getTime() > now.getTime()) {
      await this.writeSecurityLog('login_blocked', user.id, ipAddress, {
        lockedUntil: user.lockedUntil.toISOString(),
      });
      throw new UnauthorizedException(`登录失败次数过多，请在 ${user.lockedUntil.toLocaleString('zh-CN')} 后重试`);
    }

    const matched = await bcrypt.compare(password, user.passwordHash);
    if (!matched) {
      const attempts = (user.failedLoginAttempts ?? 0) + 1;
      user.failedLoginAttempts = attempts;
      user.lockedUntil = attempts >= this.maxLoginAttempts
        ? new Date(now.getTime() + this.lockMinutes * 60_000)
        : null;
      await this.userRepository.save(user);
      await this.writeSecurityLog('login_failed', user.id, ipAddress, {
        reason: 'invalid_credentials',
        failedAttempts: attempts,
        lockedUntil: user.lockedUntil?.toISOString() ?? null,
      });
      throw new UnauthorizedException('用户名或密码错误');
    }

    const roleCodes = this.getActiveRoleCodes(user);
    const fixedScopeAccount = roleCodes.some((code) => BUSINESS_FRONT_ROLE_CODES.has(code));
    const accountScope = user.businessScope ?? BusinessScope.BEILUN;
    if (requestedBusinessScope && fixedScopeAccount && accountScope !== requestedBusinessScope) {
      await this.writeSecurityLog('login_scope_rejected', user.id, ipAddress, {
        requestedBusinessScope,
        accountScope,
      });
      throw new UnauthorizedException(
        accountScope === BusinessScope.OUT_OF_PROVINCE
          ? '该账号属于浙江自签业务，请从浙江自签入口登录'
          : '该账号属于北仑本地业务，请从北仑业务入口登录',
      );
    }

    user.lastLoginAt = now;
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await this.userRepository.save(user);

    const permissions = await this.buildUserPermissions(roleCodes);
    const payload = this.createJwtPayload(user, roleCodes);
    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET ?? 'change-me-jwt-refresh-secret',
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    });

    await this.writeSecurityLog('login_success', user.id, ipAddress, {
      mustChangePassword: user.mustChangePassword,
      roles: roleCodes,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        realName: user.realName,
        email: user.email,
        phone: user.phone,
        roles: roleCodes,
        permissions,
        businessScope: user.businessScope ?? BusinessScope.BEILUN,
        business_scope: user.businessScope ?? BusinessScope.BEILUN,
        mustChangePassword: user.mustChangePassword,
        must_change_password: user.mustChangePassword,
      },
    };
  }

  async refresh(refreshToken: string, ipAddress?: string): Promise<{ accessToken: string }> {
    let payload: JwtUserPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtUserPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET ?? 'change-me-jwt-refresh-secret',
      });
    } catch {
      throw new UnauthorizedException('refresh token 无效或已过期');
    }

    const user = await this.userRepository.findOne({
      where: { id: payload.sub, isActive: true },
      relations: { userRoles: { role: true } },
    });
    if (!user || user.authVersion !== (payload.authVersion ?? 0)) {
      await this.writeSecurityLog('refresh_rejected', payload.sub, ipAddress, {
        reason: user ? 'session_revoked' : 'inactive_or_missing_user',
      });
      throw new UnauthorizedException('登录状态已失效，请重新登录');
    }

    const currentPayload = this.createJwtPayload(user, this.getActiveRoleCodes(user));
    return { accessToken: await this.jwtService.signAsync(currentPayload) };
  }

  async me(userId: string): Promise<{
    id: string;
    username: string;
    realName: string;
    email: string | null;
    phone: string | null;
    isActive: boolean;
    lastLoginAt: Date | null;
    mustChangePassword: boolean;
    must_change_password: boolean;
    businessScope: BusinessScope;
    business_scope: BusinessScope;
    roles: Array<{
      roleCode: string;
      roleName: string;
      departmentId: string;
      departmentName: string;
      isPrimary: boolean;
    }>;
    permissions: string[];
  }> {
    const user = await this.userRepository.findOne({
      where: { id: userId, isActive: true },
      relations: { userRoles: { role: true, department: true } },
    });
    if (!user) {
      throw new UnauthorizedException('用户不存在或已停用');
    }

    const roleCodes = this.getActiveRoleCodes(user);
    const permissions = await this.buildUserPermissions(roleCodes);
    return {
      id: user.id,
      username: user.username,
      realName: user.realName,
      email: user.email,
      phone: user.phone,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      mustChangePassword: user.mustChangePassword,
      must_change_password: user.mustChangePassword,
      businessScope: user.businessScope ?? BusinessScope.BEILUN,
      business_scope: user.businessScope ?? BusinessScope.BEILUN,
      roles: user.userRoles
        .filter((binding) => binding.role?.isActive && binding.department)
        .map((binding) => ({
          roleCode: binding.role.code,
          roleName: binding.role.name,
          departmentId: binding.departmentId,
          departmentName: binding.department.name,
          isPrimary: binding.isPrimary,
        })),
      permissions,
    };
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
    ipAddress?: string,
  ): Promise<{ success: boolean }> {
    const current = await this.userRepository.findOne({ where: { id: userId, isActive: true } });
    if (!current) {
      throw new UnauthorizedException('用户不存在或已停用');
    }
    if (!(await bcrypt.compare(oldPassword, current.passwordHash))) {
      await this.writeSecurityLog('change_password_failed', userId, ipAddress, { reason: 'old_password_mismatch' });
      throw new BadRequestException('旧密码不正确');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: userId, isActive: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user || user.passwordHash !== current.passwordHash) {
        throw new UnauthorizedException('账号状态已变化，请重新登录后再试');
      }

      user.passwordHash = passwordHash;
      user.mustChangePassword = false;
      user.passwordUpdatedAt = new Date();
      user.authVersion = (user.authVersion ?? 0) + 1;
      await manager.save(User, user);

      const verified = await manager.findOne(User, { where: { id: userId } });
      if (!verified || verified.mustChangePassword || !verified.passwordUpdatedAt) {
        throw new InternalServerErrorException('密码状态保存失败');
      }
    });

    await this.writeSecurityLog('change_password', userId, ipAddress, { sessionsRevoked: true });
    return { success: true };
  }

  async logout(userId: string, ipAddress?: string): Promise<{ success: boolean }> {
    await this.userRepository.increment({ id: userId }, 'authVersion', 1);
    await this.writeSecurityLog('logout', userId, ipAddress, { sessionsRevoked: true });
    return { success: true };
  }

  private async writeSecurityLog(
    actionType: string,
    userId?: string,
    ipAddress?: string,
    details: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      await this.operationLogRepository.save(this.operationLogRepository.create({
        entityType: 'auth',
        entityId: userId ?? ZERO_UUID,
        userId: userId ?? null,
        actionType,
        beforeData: null,
        afterData: details,
        ipAddress: ipAddress ?? null,
      }));
    } catch (error) {
      this.logger.error('auth audit log write failed', error instanceof Error ? error.stack : String(error));
    }
  }
}
