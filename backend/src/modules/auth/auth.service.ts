import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User } from 'src/entities';
import { JwtUserPayload, LoginResult } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async login(username: string, password: string): Promise<LoginResult> {
    const user = await this.userRepository.findOne({
      where: { username, isActive: true },
      relations: {
        userRoles: {
          role: true,
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const matched = await bcrypt.compare(password, user.passwordHash);
    if (!matched) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    user.lastLoginAt = new Date();
    await this.userRepository.save(user);

    const roleCodes = Array.from(
      new Set(user.userRoles.map((userRole) => userRole.role.code)),
    );
    const payload: JwtUserPayload = {
      sub: user.id,
      username: user.username,
      roles: roleCodes,
    };

    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET ?? 'change-me-jwt-refresh-secret',
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
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
        permissions: roleCodes.map((code) => `role:${code}`),
        mustChangePassword: user.mustChangePassword,
        must_change_password: user.mustChangePassword,
      },
    };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtUserPayload>(
        refreshToken,
        {
          secret:
            process.env.JWT_REFRESH_SECRET ?? 'change-me-jwt-refresh-secret',
        },
      );

      const accessToken = await this.jwtService.signAsync({
        sub: payload.sub,
        username: payload.username,
        roles: payload.roles,
      });

      return { accessToken };
    } catch {
      throw new UnauthorizedException('refresh token 无效或已过期');
    }
  }

  async me(userId: string): Promise<{
    id: string;
    username: string;
    realName: string;
    email: string | null;
    phone: string | null;
    isActive: boolean;
    lastLoginAt: Date | null;
    roles: Array<{
      roleCode: string;
      roleName: string;
      departmentId: string;
      departmentName: string;
      isPrimary: boolean;
    }>;
  }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: {
        userRoles: {
          role: true,
          department: true,
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    return {
      id: user.id,
      username: user.username,
      realName: user.realName,
      email: user.email,
      phone: user.phone,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      roles: user.userRoles.map((userRole) => ({
        roleCode: userRole.role.code,
        roleName: userRole.role.name,
        departmentId: userRole.departmentId,
        departmentName: userRole.department.name,
        isPrimary: userRole.isPrimary,
      })),
    };
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    const matched = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!matched) {
      throw new BadRequestException('旧密码不正确');
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = false;
    user.passwordUpdatedAt = new Date();
    await this.userRepository.save(user);

    return { success: true };
  }

  async logout(): Promise<{ success: boolean }> {
    return { success: true };
  }
}
