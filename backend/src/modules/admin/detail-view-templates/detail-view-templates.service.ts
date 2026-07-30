import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DetailViewTemplate, FieldConfig, FieldPermission, FieldPermissionMode, Role } from 'src/entities';
import { getDetailViewFieldCodes } from './detail-view-template-fields';

const CONTRACT_MODULE_CODE = 'contract';
const CONTRACT_SCENARIO = 'dispatched:contract';
const BUSINESS_MEMBER_ROLE_CODES = ['business_group_member', 'biz_member'];

@Injectable()
export class DetailViewTemplatesService {
  constructor(
    @InjectRepository(DetailViewTemplate)
    private readonly repo: Repository<DetailViewTemplate>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(FieldConfig)
    private readonly fieldConfigRepo: Repository<FieldConfig>,
    @InjectRepository(FieldPermission)
    private readonly fieldPermissionRepo: Repository<FieldPermission>,
  ) {}

  async list(moduleCode?: string) {
    const qb = this.repo.createQueryBuilder('t').orderBy('t.created_at', 'DESC');
    if (moduleCode) {
      qb.andWhere('t.module_code = :moduleCode', { moduleCode });
    }
    return qb.getMany();
  }

  async get(id: string) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException('详情页字段配置不存在');
    }
    return item;
  }

  async getActiveByModule(moduleCode: string) {
    return this.repo.findOne({
      where: { moduleCode, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  async create(payload: {
    templateName: string;
    moduleCode: string;
    fieldList: Array<Record<string, unknown>>;
    isActive?: boolean;
    createdBy?: string;
  }) {
    const saved = await this.repo.save(this.repo.create(payload));
    if (saved.moduleCode === CONTRACT_MODULE_CODE) await this.syncContractBusinessPermissions();
    return saved;
  }

  async update(
    id: string,
    payload: Partial<{
      templateName: string;
      moduleCode: string;
      fieldList: Array<Record<string, unknown>>;
      isActive: boolean;
    }>,
  ) {
    const item = await this.get(id);
    const previousModuleCode = item.moduleCode;
    Object.assign(item, payload);
    const saved = await this.repo.save(item);
    if (previousModuleCode === CONTRACT_MODULE_CODE || saved.moduleCode === CONTRACT_MODULE_CODE) {
      await this.syncContractBusinessPermissions();
    }
    return saved;
  }

  async remove(id: string) {
    const item = await this.get(id);
    await this.repo.remove(item);
    if (item.moduleCode === CONTRACT_MODULE_CODE) await this.syncContractBusinessPermissions();
    return { success: true };
  }

  private async syncContractBusinessPermissions(): Promise<void> {
    const template = await this.getActiveByModule(CONTRACT_MODULE_CODE);
    if (!template) return;

    const configuredFields = new Set(getDetailViewFieldCodes(template.fieldList));
    const [roles, fields] = await Promise.all([
      this.roleRepo.find({ where: { code: In(BUSINESS_MEMBER_ROLE_CODES) } }),
      this.fieldConfigRepo.find({ where: { isActive: true } }),
    ]);
    if (roles.length === 0 || fields.length === 0) return;

    await this.fieldPermissionRepo.upsert(
      roles.flatMap((role) => fields.map((field) => ({
        roleId: role.id,
        fieldCode: field.fieldCode,
        scenario: CONTRACT_SCENARIO,
        permission: configuredFields.has(field.fieldCode) ? FieldPermissionMode.VISIBLE : FieldPermissionMode.HIDDEN,
      }))),
      ['roleId', 'fieldCode', 'scenario'],
    );
  }
}
