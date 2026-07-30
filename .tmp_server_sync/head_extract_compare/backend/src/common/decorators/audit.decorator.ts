import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit';

export interface AuditMetadata {
  entityType: string;
  actionType: string;
}

export const Audit = (
  entityType: string,
  actionType: string,
): MethodDecorator & ClassDecorator =>
  SetMetadata(AUDIT_KEY, { entityType, actionType } satisfies AuditMetadata);
