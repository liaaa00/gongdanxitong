import { SetMetadata } from '@nestjs/common';

export const ALLOW_BEFORE_PASSWORD_CHANGE_KEY = 'allowBeforePasswordChange';

export const AllowBeforePasswordChange = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_BEFORE_PASSWORD_CHANGE_KEY, true);
