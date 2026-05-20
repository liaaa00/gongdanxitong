import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FieldConfig, FieldPermission, FieldPermissionMode, Role } from 'src/entities';

interface BatchPermissionItem {
  roleId: string;
  scenario: string;
  fieldCode: string;
  permission: FieldPermissionMode;
}

export const FIELD_PERMISSION_MATRIX_SCENARIOS = [
  'create:onboarding',
  'create:in_service',
  'create:resignation',
  'dispatched:data_entry',
  'dispatched:social_insurance',
  'dispatched:onboarding_contact',
  'dispatched:contract',
  'dispatched:renewal_contract',
  'dispatched:benefit',
  'dispatched:resignation_contact',
  'dispatched:resignation_cert',
  'dispatched:data_entry_resign',
] as const;

const FIELD_PERMISSION_MATRIX_SCENARIO_SET = new Set<string>(FIELD_PERMISSION_MATRIX_SCENARIOS);

@Injectable()
export class FieldPermissionService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(FieldPermission)
    private readonly fieldPermissionRepository: Repository<FieldPermission>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(FieldConfig)
    private readonly fieldConfigRepository: Repository<FieldConfig>,
  ) {}

  async getMatrix(): Promise<{
    scenarios: string[];
    matrix: Record<string, Record<string, Record<string, FieldPermissionMode>>>;
  }> {
    const items = await this.fieldPermissionRepository.find({
      where: FIELD_PERMISSION_MATRIX_SCENARIOS.map((scenario) => ({ scenario })),
    });
    const scenarios = [...FIELD_PERMISSION_MATRIX_SCENARIOS];
    const matrix: Record<string, Record<string, Record<string, FieldPermissionMode>>> = {};

    for (const item of items) {
      if (!FIELD_PERMISSION_MATRIX_SCENARIO_SET.has(item.scenario)) continue;
      if (!matrix[item.roleId]) {
        matrix[item.roleId] = {};
      }
      if (!matrix[item.roleId][item.scenario]) {
        matrix[item.roleId][item.scenario] = {};
      }
      matrix[item.roleId][item.scenario][item.fieldCode] = item.permission;
    }

    return { scenarios, matrix };
  }

  async batchUpsert(items: BatchPermissionItem[]): Promise<{ affected: number }> {
    return this.dataSource.transaction(async (manager) => {
      let affected = 0;
      for (const item of items) {
        const existed = await manager.findOne(FieldPermission, {
          where: {
            roleId: item.roleId,
            scenario: item.scenario,
            fieldCode: item.fieldCode,
          },
        });

        if (existed) {
          existed.permission = item.permission;
          await manager.save(FieldPermission, existed);
          affected += 1;
          continue;
        }

        await manager.save(
          FieldPermission,
          manager.create(FieldPermission, {
            roleId: item.roleId,
            scenario: item.scenario,
            fieldCode: item.fieldCode,
            permission: item.permission,
          }),
        );
        affected += 1;
      }

      return { affected };
    });
  }

  async copyToRoles(input: {
    sourceRoleId: string;
    targetRoleIds: string[];
    scenarios?: string[];
  }): Promise<{ affected: number }> {
    const sourceRows = await this.fieldPermissionRepository.find({
      where: { roleId: input.sourceRoleId },
    });

    const filtered =
      input.scenarios && input.scenarios.length > 0
        ? sourceRows.filter((item) => input.scenarios?.includes(item.scenario))
        : sourceRows;

    return this.dataSource.transaction(async (manager) => {
      let affected = 0;
      for (const targetRoleId of input.targetRoleIds) {
        for (const row of filtered) {
          const existed = await manager.findOne(FieldPermission, {
            where: {
              roleId: targetRoleId,
              scenario: row.scenario,
              fieldCode: row.fieldCode,
            },
          });

          if (existed) {
            existed.permission = row.permission;
            await manager.save(FieldPermission, existed);
            affected += 1;
            continue;
          }

          await manager.save(
            FieldPermission,
            manager.create(FieldPermission, {
              roleId: targetRoleId,
              scenario: row.scenario,
              fieldCode: row.fieldCode,
              permission: row.permission,
            }),
          );
          affected += 1;
        }
      }
      return { affected };
    });
  }

  async getVisibleFieldsForRoleScenario(
    roleId: string,
    scenario: string,
  ): Promise<string[]> {
    const rows = await this.fieldPermissionRepository.find({
      where: { roleId, scenario },
    });

    return rows
      .filter((row) => row.permission !== FieldPermissionMode.HIDDEN)
      .map((row) => row.fieldCode);
  }

  async filterExtraData(
    extraData: Record<string, unknown>,
    roleIds: string[],
    scenario: string,
  ): Promise<Record<string, unknown>> {
    const fields = await this.fieldConfigRepository.find({ where: { isActive: true } });
    const permissions = await this.fieldPermissionRepository
      .createQueryBuilder('fp')
      .where('fp.roleId IN (:...roleIds)', { roleIds })
      .andWhere('fp.scenario = :scenario', { scenario })
      .getMany();

    const permissionMap = this.mergePermissions(permissions);
    const fieldSet = new Set(fields.map((field) => field.fieldCode));

    const output: Record<string, unknown> = {};
    for (const [fieldCode, value] of Object.entries(extraData)) {
      if (!fieldSet.has(fieldCode)) {
        continue;
      }

      const permission = permissionMap[fieldCode] ?? FieldPermissionMode.HIDDEN;
      if (permission === FieldPermissionMode.HIDDEN) {
        continue;
      }

      output[fieldCode] =
        permission === FieldPermissionMode.MASKED
          ? this.applyMask(fieldCode, value)
          : value;
    }

    return output;
  }

  applyMask(fieldCode: string, value: unknown): unknown {
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

    return `${text.slice(0, 2)}***`;
  }

  async getAvailableExportFields(
    roleId: string,
    scenario: string,
  ): Promise<string[]> {
    const visible = await this.getVisibleFieldsForRoleScenario(roleId, scenario);
    const activeFields = await this.fieldConfigRepository.find({ where: { isActive: true } });
    const activeSet = new Set(activeFields.map((item) => item.fieldCode));

    return visible.filter((fieldCode) => activeSet.has(fieldCode));
  }

  private mergePermissions(
    rows: FieldPermission[],
  ): Record<string, FieldPermissionMode> {
    const rank: Record<FieldPermissionMode, number> = {
      [FieldPermissionMode.HIDDEN]: 0,
      [FieldPermissionMode.MASKED]: 1,
      [FieldPermissionMode.READONLY]: 2,
      [FieldPermissionMode.VISIBLE]: 3,
    };

    const merged: Record<string, FieldPermissionMode> = {};

    for (const row of rows) {
      const current = merged[row.fieldCode];
      if (!current || rank[row.permission] > rank[current]) {
        merged[row.fieldCode] = row.permission;
      }
    }

    return merged;
  }
}
