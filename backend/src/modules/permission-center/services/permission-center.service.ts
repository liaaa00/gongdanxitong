import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PermissionConfigVersionEntity } from '../entities/permission-config-version.entity';
import { PermissionConfig, FieldViewMode } from '../types/permission-config.types';

@Injectable()
export class PermissionCenterService {
  constructor(
    @InjectRepository(PermissionConfigVersionEntity)
    private configRepo: Repository<PermissionConfigVersionEntity>,
  ) {}

  /**
   * 获取当前激活的权限配置
   */
  async getActiveConfig(): Promise<PermissionConfig> {
    const active = await this.configRepo.findOne({
      where: { is_active: true },
      order: { activated_at: 'DESC' },
    });

    if (!active) {
      throw new NotFoundException('No active permission config found');
    }

    return active.config;
  }

  /**
   * 创建新的权限配置版本
   */
  async createVersion(
    config: PermissionConfig,
    createdBy: string,
    description?: string,
  ): Promise<PermissionConfigVersionEntity> {
    const version = this.configRepo.create({
      version: config.version,
      config,
      created_by: createdBy,
      description,
      is_active: false,
    });

    return this.configRepo.save(version);
  }

  /**
   * 激活指定版本的配置
   */
  async activateVersion(versionId: string): Promise<void> {
    // 停用所有现有版本
    await this.configRepo.update({ is_active: true }, { is_active: false });

    // 激活指定版本
    await this.configRepo.update(
      { id: versionId },
      { is_active: true, activated_at: new Date() },
    );
  }

  /**
   * 按角色查询路由权限
   */
  async getRoutePermissionsForRole(roleCode: string): Promise<string[]> {
    const config = await this.getActiveConfig();
    return config.routePermissions
      .filter(rp => rp.allowedRoles.includes(roleCode))
      .map(rp => rp.path);
  }

  /**
   * 按场景和角色查询字段权限
   */
  async getFieldPermissionsForRole(
    scenario: string,
    roleCode: string,
  ): Promise<Record<string, FieldViewMode>> {
    const config = await this.getActiveConfig();
    const rule = config.fieldPermissions.find(fp => fp.scenario === scenario);
    return rule?.roleFieldRules[roleCode] || {};
  }

  /**
   * 获取所有配置版本
   */
  async getAllVersions(): Promise<PermissionConfigVersionEntity[]> {
    return this.configRepo.find({
      order: { created_at: 'DESC' },
    });
  }

  /**
   * 获取指定版本
   */
  async getVersionById(id: string): Promise<PermissionConfigVersionEntity> {
    const version = await this.configRepo.findOne({ where: { id } });
    if (!version) {
      throw new NotFoundException(`Version ${id} not found`);
    }
    return version;
  }
}
