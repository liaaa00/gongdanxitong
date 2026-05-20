import { SetMetadata } from '@nestjs/common';
import { JwtUserPayload } from 'src/modules/auth/auth.types';

export interface FieldPermissionContext {
  params: Record<string, string>;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
  user?: JwtUserPayload;
}

export type FieldPermissionScenarioResolver = string | ((ctx: FieldPermissionContext) => string | Promise<string>);

export const FIELD_PERMISSION_SCENARIO_KEY = 'fieldPermissionScenario';

export const FieldPermissionScenario = (
  scenario: FieldPermissionScenarioResolver,
): MethodDecorator & ClassDecorator => SetMetadata(FIELD_PERMISSION_SCENARIO_KEY, scenario);

export const ApplyFieldPermission = FieldPermissionScenario;
