import { SetMetadata } from '@nestjs/common';

export const BUSINESS_PERMISSION_KEY = 'business_permission';
export const BusinessPermission = (permission: string): MethodDecorator & ClassDecorator =>
  SetMetadata(BUSINESS_PERMISSION_KEY, permission);
