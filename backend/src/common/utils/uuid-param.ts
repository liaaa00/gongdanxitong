import { NotFoundException } from '@nestjs/common';

export const UUID_V4_LIKE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidLike(value: string): boolean {
  return UUID_V4_LIKE_PATTERN.test(value);
}

export function assertUuidParam(value: string, message = '资源不存在'): string {
  if (!isUuidLike(value)) {
    throw new NotFoundException(message);
  }
  return value;
}
