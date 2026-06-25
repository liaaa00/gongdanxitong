import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtUserPayload } from 'src/modules/auth/auth.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): JwtUserPayload => {
    const request = context.switchToHttp().getRequest<{ user: JwtUserPayload }>();
    return request.user;
  },
);
