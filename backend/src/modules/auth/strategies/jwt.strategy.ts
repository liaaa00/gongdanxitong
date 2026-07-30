import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { AppConfig } from 'src/config/configuration';
import { BusinessScope, User } from 'src/entities';
import { JwtUserPayload } from '../auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService<AppConfig, true>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('app.jwtSecret', { infer: true }),
    });
  }

  async validate(payload: JwtUserPayload): Promise<JwtUserPayload> {
    const user = await this.userRepository.findOne({
      where: { id: payload.sub, isActive: true },
      relations: { userRoles: { role: true } },
    });

    if (!user || user.authVersion !== (payload.authVersion ?? 0)) {
      throw new UnauthorizedException('登录状态已失效，请重新登录');
    }

    const roles = Array.from(new Set(
      user.userRoles
        .filter((binding) => binding.role?.isActive)
        .map((binding) => binding.role.code),
    ));

    return {
      sub: user.id,
      username: user.username,
      realName: user.realName,
      real_name: user.realName,
      roles,
      businessScope: user.businessScope ?? BusinessScope.BEILUN,
      authVersion: user.authVersion,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
