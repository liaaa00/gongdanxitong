import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

export function monitorConfigured(): boolean {
  const configured = process.env.CONNECTOR_TOKEN || '';
  return configured.length >= 16 && configured !== 'test-connector-token';
}
export function validMonitorToken(value: unknown): boolean {
  if (!monitorConfigured() || typeof value !== 'string') return false;
  const expected = Buffer.from(process.env.CONNECTOR_TOKEN!);
  const supplied = Buffer.from(value);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
@Injectable()
export class PortalMonitorConnectorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!validMonitorToken(context.switchToHttp().getRequest().headers['x-connector-token'])) throw new UnauthorizedException('监控连接认证失败');
    return true;
  }
}
