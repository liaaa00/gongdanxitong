import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ALLOW_BEFORE_PASSWORD_CHANGE_KEY } from 'src/common/decorators/allow-before-password-change.decorator';
import { IS_PUBLIC_KEY } from 'src/common/decorators/public.decorator';
import { JwtUserPayload } from 'src/modules/auth/auth.types';

@Injectable()
export class PasswordChangeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }
    if (this.reflector.getAllAndOverride<boolean>(ALLOW_BEFORE_PASSWORD_CHANGE_KEY, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: JwtUserPayload }>();
    if (request.user?.mustChangePassword) {
      throw new ForbiddenException('请先修改初始密码');
    }
    return true;
  }
}
