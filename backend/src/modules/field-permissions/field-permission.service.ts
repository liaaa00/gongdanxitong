import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FieldConfig, FieldPermission, FieldPermissionMode, Role, UserRole } from 'src/entities';
import { AstEvalTrace } from 'src/modules/dispatch-engine/dispatch-engine.types';

export type FieldPermissionMap = Map<string, FieldPermissionMode>;

export interface FieldViewItem {
  fieldCode: string;
  fieldName: string;
  fieldType: string;
  value: unknown;
  permission: FieldPermissionMode;
  supplementable?: boolean;
  dropdownOptions?: Array<{ label: string; value: string }>;
  validation?: {
    required: boolean;
    regex?: string;
    regexMsg?: string;
  };
}

const RANK: Record<FieldPermissionMode, number> = {
  [FieldPermissionMode.HIDDEN]: 0,
  [FieldPermissionMode.MASKED]: 1,
  [FieldPermissionMode.READONLY]: 2,
  [FieldPermissionMode.VISIBLE]: 3,
};

const SCENARIO_ALIASES: Record<string, string[]> = {
  main: ['create:onboarding', 'create:in_service', 'create:resignation'],
  'dispatched:benefit_apply': ['dispatched:benefit'],
  'dispatched:social_security': ['dispatched:social_insurance'],
};

function expandScenarioAliases(scenario: string): string[] {
  return [scenario, ...(SCENARIO_ALIASES[scenario] ?? [])];
}

@Injectable()
export class FieldPermissionService {
  constructor(
    @InjectRepository(FieldPermission)
    private readonly fieldPermissionRepository: Repository<FieldPermission>,
    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(FieldConfig)
    private readonly fieldConfigRepository: Repository<FieldConfig>,
  ) {}

  async getPermissionsForUser(userId: string, scenario: string): Promise<FieldPermissionMap> {
    const activeFields = await this.fieldConfigRepository.find({
      where: { isActive: true },
      order: { displayOrder: 'ASC' },
    });

    const permissions = new Map<string, FieldPermissionMode>();
    const roleRows = await this.userRoleRepository.find({
      where: { userId },
      relations: { role: true },
    });

    const roleCodes = roleRows.map((row) => row.role.code);
    if (roleCodes.includes('admin')) {
      for (const field of activeFields) {
        permissions.set(field.fieldCode, FieldPermissionMode.VISIBLE);
      }
      return permissions;
    }

    if (roleRows.length === 0) {
      for (const field of activeFields) {
        permissions.set(field.fieldCode, FieldPermissionMode.HIDDEN);
      }
      return permissions;
    }

    const roleIds = roleRows.map((row) => row.roleId);
    const scenarioAliases = expandScenarioAliases(scenario);
    const rows = await this.fieldPermissionRepository.find({
      where: { roleId: In(roleIds), scenario: In(scenarioAliases) },
    });

    return this.mergePermissionRows(activeFields, rows);
  }

  async getVisibleFieldsForScenario(scenario: string): Promise<string[]> {
    const activeFields = await this.fieldConfigRepository.find({
      where: { isActive: true },
      order: { displayOrder: 'ASC' },
    });
    const rows = await this.fieldPermissionRepository.find({ where: { scenario: In(expandScenarioAliases(scenario)) } });
    const merged = this.mergePermissionRows(activeFields, rows);
    return activeFields
      .filter((field) => (merged.get(field.fieldCode) ?? FieldPermissionMode.HIDDEN) !== FieldPermissionMode.HIDDEN)
      .map((field) => field.fieldCode);
  }

  applyExtraData(
    extraData: Record<string, unknown>,
    permissions: FieldPermissionMap,
  ): { data: Record<string, unknown>; readonlyFields: string[] } {
    const data: Record<string, unknown> = {};
    const readonlyFields: string[] = [];

    for (const [fieldCode, value] of Object.entries(extraData)) {
      const permission = permissions.get(fieldCode) ?? FieldPermissionMode.HIDDEN;
      if (permission === FieldPermissionMode.HIDDEN) {
        continue;
      }
      if (permission === FieldPermissionMode.READONLY) {
        readonlyFields.push(fieldCode);
      }
      data[fieldCode] = permission === FieldPermissionMode.MASKED ? this.maskValue(fieldCode, value) : value;
    }

    return { data, readonlyFields };
  }

  applyFieldViews(
    fields: FieldViewItem[],
    permissions: FieldPermissionMap,
  ): FieldViewItem[] {
    const result: FieldViewItem[] = [];
    for (const field of fields) {
      const permission = permissions.get(field.fieldCode) ?? FieldPermissionMode.HIDDEN;
      if (permission === FieldPermissionMode.HIDDEN) {
        continue;
      }
      result.push({
        ...field,
        permission,
        value: permission === FieldPermissionMode.MASKED ? this.maskValue(field.fieldCode, field.value) : field.value,
      });
    }
    return result;
  }

  buildFieldViews(
    fields: FieldConfig[],
    extraData: Record<string, unknown>,
    permissions: FieldPermissionMap,
    supplementableFields: string[] = [],
  ): FieldViewItem[] {
    return this.applyFieldViews(
      fields.map((field) => ({
        fieldCode: field.fieldCode,
        fieldName: field.fieldName,
        fieldType: field.fieldType,
        value: extraData[field.fieldCode] ?? null,
        permission: permissions.get(field.fieldCode) ?? FieldPermissionMode.HIDDEN,
        supplementable: supplementableFields.includes(field.fieldCode),
        dropdownOptions: field.dropdownOptions
          ? field.dropdownOptions.map((option) => ({ label: option, value: option }))
          : undefined,
        validation: {
          required: field.isRequired || field.defaultRequired,
          regex: field.validationRegex ?? undefined,
          regexMsg: field.validationMsg ?? undefined,
        },
      })),
      permissions,
    );
  }

  getAstTraceHint(_trace: AstEvalTrace): string {
    return 'trace-available';
  }

  private mergePermissionRows(
    activeFields: FieldConfig[],
    rows: FieldPermission[],
  ): FieldPermissionMap {
    const merged = new Map<string, FieldPermissionMode>();
    for (const row of rows) {
      const current = merged.get(row.fieldCode);
      if (!current || RANK[row.permission] > RANK[current]) {
        merged.set(row.fieldCode, row.permission);
      }
    }

    const result: FieldPermissionMap = new Map();
    for (const field of activeFields) {
      result.set(field.fieldCode, merged.get(field.fieldCode) ?? FieldPermissionMode.HIDDEN);
    }
    return result;
  }

  private maskValue(fieldCode: string, value: unknown): unknown {
    const text = String(value ?? '');
    if (text.length === 0) {
      return value;
    }

    if (fieldCode.includes('id_card') || fieldCode.includes('idCard')) {
      if (text.length <= 10) {
        return `${text.slice(0, 2)}****${text.slice(-2)}`;
      }
      return `${text.slice(0, 6)}********${text.slice(-4)}`;
    }

    if (fieldCode.includes('mobile') || fieldCode.includes('phone')) {
      if (text.length < 7) {
        return `${text.slice(0, 2)}***`;
      }
      return `${text.slice(0, 3)}****${text.slice(-4)}`;
    }

    if (fieldCode.includes('bank_account')) {
      return text.length <= 4 ? '****' : `${'*'.repeat(Math.max(0, text.length - 4))}${text.slice(-4)}`;
    }

    return `${text.slice(0, 2)}***`;
  }
}
