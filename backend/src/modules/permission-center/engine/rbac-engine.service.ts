import { Injectable } from '@nestjs/common';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import {
  FieldViewMode,
  FieldPermissionRule,
  PermissionConfig,
  RoutePermission,
} from '../types/permission-config.types';
import { PermissionCenterService } from '../services/permission-center.service';

/** A role list or an authenticated user carrying that role list. */
export type RbacSubject =
  | readonly string[]
  | Pick<JwtUserPayload, 'roles'>
  | null
  | undefined;

const FIELD_PERMISSION_RANK: Record<FieldViewMode, number> = {
  [FieldViewMode.HIDDEN]: 0,
  [FieldViewMode.MASKED]: 1,
  [FieldViewMode.READONLY]: 2,
  [FieldViewMode.VISIBLE]: 3,
};

/**
 * Evaluates the active permission-center configuration for runtime callers.
 *
 * This service intentionally fails closed when no active configuration can be
 * loaded. Role codes and canonical codes are treated as aliases so JWTs can
 * continue carrying backend role codes while the configuration uses the
 * normalized frontend code.
 */
@Injectable()
export class RbacEngineService {
  constructor(private readonly permissionCenterService: PermissionCenterService) {}

  /** Check an action, optionally constrained to a route/resource path. */
  async can(user: RbacSubject, action: string, resource?: string): Promise<boolean> {
    return this.canAccess(user, action, resource);
  }

  /** Check whether any supplied role grants the requested backend action. */
  async canAccess(
    userRoles: RbacSubject,
    action: string,
    resource?: string,
  ): Promise<boolean> {
    const normalizedAction = this.normalize(action);
    if (!normalizedAction) return false;

    const config = await this.loadConfig();
    if (!config) return false;

    const roleAliases = this.expandActiveRoleAliases(userRoles, config);
    if (roleAliases.size === 0) return false;

    return config.routePermissions.some((route) => (
      route.backendActions?.some((routeAction) => this.normalize(routeAction) === normalizedAction)
      && this.hasAllowedRole(route, roleAliases)
      && (resource === undefined || this.matchesResource(route.path, resource))
    ));
  }

  /** Return configured routes accessible to at least one supplied role. */
  async getAccessibleRoutes(userRoles: RbacSubject): Promise<string[]> {
    const config = await this.loadConfig();
    if (!config) return [];

    const roleAliases = this.expandActiveRoleAliases(userRoles, config);
    if (roleAliases.size === 0) return [];

    const routes = new Set<string>();
    for (const route of config.routePermissions) {
      if (this.hasAllowedRole(route, roleAliases)) {
        routes.add(route.path);
      }
    }
    return [...routes];
  }

  /**
   * Merge field permissions across roles for a scenario.
   * More permissive modes win, matching the existing FieldPermissionService
   * merge semantics (hidden < masked < readonly < visible).
   */
  async getFieldPermissions(
    userRoles: RbacSubject,
    scenario: string,
  ): Promise<Record<string, FieldViewMode>> {
    const normalizedScenario = this.normalize(scenario);
    if (!normalizedScenario) return {};

    const config = await this.loadConfig();
    if (!config) return {};

    const roleAliases = this.expandActiveRoleAliases(userRoles, config);
    if (roleAliases.size === 0) return {};

    const rule = config.fieldPermissions.find(
      (candidate) => this.normalize(candidate.scenario) === normalizedScenario,
    );
    if (!rule) return {};

    const merged: Record<string, FieldViewMode> = {};
    for (const [roleCode, fields] of Object.entries(rule.roleFieldRules)) {
      if (!roleAliases.has(this.normalize(roleCode))) continue;
      for (const [fieldCode, permission] of Object.entries(fields)) {
        const current = merged[fieldCode];
        if (!current || FIELD_PERMISSION_RANK[permission] > FIELD_PERMISSION_RANK[current]) {
          merged[fieldCode] = permission;
        }
      }
    }
    return merged;
  }

  private async loadConfig(): Promise<PermissionConfig | null> {
    try {
      return await this.permissionCenterService.getActiveConfig();
    } catch {
      return null;
    }
  }

  private extractRoles(subject: RbacSubject): readonly string[] {
    if (subject && typeof subject === 'object' && 'roles' in subject) {
      return subject.roles ?? [];
    }
    return Array.isArray(subject) ? (subject as readonly string[]) : [];
  }

  private expandActiveRoleAliases(subject: RbacSubject, config: PermissionConfig): Set<string> {
    const provided = new Set(this.extractRoles(subject).map((role) => this.normalize(role)).filter(Boolean));
    const disabledAliases = new Set<string>();

    for (const role of config.roles ?? []) {
      if (!role.isActive) {
        disabledAliases.add(this.normalize(role.code));
        disabledAliases.add(this.normalize(role.canonicalCode));
      }
    }

    const expanded = new Set<string>();
    for (const role of provided) {
      if (disabledAliases.has(role)) continue;
      expanded.add(role);

      const definition = (config.roles ?? []).find((candidate) => (
        candidate.isActive
        && (
          this.normalize(candidate.code) === role
          || this.normalize(candidate.canonicalCode) === role
        )
      ));
      if (definition) {
        expanded.add(this.normalize(definition.code));
        expanded.add(this.normalize(definition.canonicalCode));
      }
    }
    return expanded;
  }

  private hasAllowedRole(route: RoutePermission, roleAliases: Set<string>): boolean {
    return route.allowedRoles.some((role) => roleAliases.has(this.normalize(role)));
  }

  private matchesResource(pattern: string, resource: string): boolean {
    const normalizedPattern = this.normalizePath(pattern);
    const normalizedResource = this.normalizePath(resource);
    if (normalizedPattern === normalizedResource) return true;

    const segments = normalizedPattern.split('/').filter(Boolean);
    let expression = '^';
    for (const segment of segments) {
      if (segment === '*') {
        expression += '(?:/.*)?';
        break;
      }
      expression += segment.startsWith(':') ? '/[^/]+' : `/${this.escapeRegex(segment)}`;
    }
    expression += '/?$';
    return new RegExp(expression).test(normalizedResource);
  }

  private normalize(value: string): string {
    return String(value ?? '').trim().toLowerCase();
  }

  private normalizePath(value: string): string {
    const path = String(value ?? '').split(/[?#]/, 1)[0].trim();
    if (!path) return '/';
    const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
    return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, '') : '/';
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
