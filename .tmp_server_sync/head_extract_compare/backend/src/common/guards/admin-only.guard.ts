import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { JwtUserPayload } from 'src/modules/auth/auth.types';

@Injectable()
export class AdminOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: JwtUserPayload }>();
    const roles = request.user?.roles ?? [];

    if (roles.includes('admin')) {
      return true;
    }

    throw new ForbiddenException('角色权限不足');
  }
}
