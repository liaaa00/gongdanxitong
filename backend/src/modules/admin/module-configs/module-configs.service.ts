import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActionConfig, BusinessScope, ModuleField, ModuleSupervisor, WorkOrderModuleConfig } from 'src/entities';

@Injectable()
export class ModuleConfigsService {
  constructor(
    @InjectRepository(WorkOrderModuleConfig)
    private readonly moduleRepository: Repository<WorkOrderModuleConfig>,
    @InjectRepository(ModuleField)
    private readonly moduleFieldRepository: Repository<ModuleField>,
    @InjectRepository(ModuleSupervisor)
    private readonly supervisorRepository: Repository<ModuleSupervisor>,
    @InjectRepository(ActionConfig)
    private readonly actionRepository: Repository<ActionConfig>,
  ) {}

  listModules(parentModuleCode?: string, isActive?: boolean, businessScope?: BusinessScope): Promise<WorkOrderModuleConfig[]> {
    const qb = this.moduleRepository.createQueryBuilder('module');
    if (parentModuleCode !== undefined) {
      if (parentModuleCode) {
        qb.andWhere('module.parent_module_code = :parentModuleCode', { parentModuleCode });
      } else {
        qb.andWhere('module.parent_module_code IS NULL');
      }
    }
    if (typeof isActive === 'boolean') {
      qb.andWhere('module.is_active = :isActive', { isActive });
    }
    if (businessScope) {
      qb.andWhere('module.business_scope = :businessScope', { businessScope });
    }
    return qb.orderBy('module.display_order', 'ASC').addOrderBy('module.module_code', 'ASC').getMany();
  }

  async saveModule(input: Partial<WorkOrderModuleConfig> & { moduleCode: string; moduleName: string }): Promise<WorkOrderModuleConfig> {
    const businessScope = input.businessScope ?? BusinessScope.BEILUN;
    const existed = await this.moduleRepository.findOne({ where: { moduleCode: input.moduleCode, businessScope } });
    if (existed) {
      Object.assign(existed, input, { businessScope, isActive: input.isActive ?? existed.isActive });
      return this.moduleRepository.save(existed);
    }
    return this.moduleRepository.save(this.moduleRepository.create({ ...input, businessScope, isActive: input.isActive ?? true }));
  }

  async updateModule(id: string, input: Partial<WorkOrderModuleConfig> & { businessScope?: BusinessScope }): Promise<WorkOrderModuleConfig> {
    const businessScope = input.businessScope ?? BusinessScope.BEILUN;
    const row = await this.moduleRepository.findOne({ where: { id, businessScope } });
    if (!row) throw new NotFoundException('模块不存在');
    Object.assign(row, input, { businessScope });
    return this.moduleRepository.save(row);
  }

  listModuleFields(moduleCode: string, businessScope: BusinessScope = BusinessScope.BEILUN): Promise<ModuleField[]> {
    return this.moduleFieldRepository.find({ where: { moduleCode, businessScope }, order: { displayOrder: 'ASC', fieldCode: 'ASC' } });
  }

  async replaceModuleFields(moduleCode: string, fields: Array<Partial<ModuleField> & { fieldCode: string }>, businessScope: BusinessScope = BusinessScope.BEILUN): Promise<{ affected: number }> {
    const existing = await this.moduleFieldRepository.find({ where: { moduleCode, businessScope } });
    const keep = new Set(fields.map((item) => item.fieldCode));
    for (const row of existing) {
      if (!keep.has(row.fieldCode)) {
        row.isActive = false;
        await this.moduleFieldRepository.save(row);
      }
    }
    let affected = 0;
    for (let index = 0; index < fields.length; index += 1) {
      const item = fields[index];
      const row = existing.find((candidate) => candidate.fieldCode === item.fieldCode);
      const payload = { businessScope, moduleCode, fieldCode: item.fieldCode, groupName: item.groupName ?? null, displayOrder: item.displayOrder ?? index + 1, isRequiredOverride: item.isRequiredOverride ?? null, isActive: item.isActive ?? true };
      if (row) {
        Object.assign(row, payload);
        await this.moduleFieldRepository.save(row);
      } else {
        await this.moduleFieldRepository.save(this.moduleFieldRepository.create(payload));
      }
      affected += 1;
    }
    return { affected };
  }

  listSupervisors(moduleCode?: string, businessScope: BusinessScope = BusinessScope.BEILUN): Promise<ModuleSupervisor[]> {
    return this.supervisorRepository.find({ where: { businessScope, ...(moduleCode ? { moduleCode } : {}) }, order: { moduleCode: 'ASC', createdAt: 'ASC' } });
  }

  async saveSupervisor(input: { moduleCode: string; supervisorId: string; isActive?: boolean; businessScope?: BusinessScope }): Promise<ModuleSupervisor> {
    const businessScope = input.businessScope ?? BusinessScope.BEILUN;
    const existed = await this.supervisorRepository.findOne({ where: { moduleCode: input.moduleCode, supervisorId: input.supervisorId, businessScope } });
    if (existed) {
      existed.isActive = input.isActive ?? true;
      return this.supervisorRepository.save(existed);
    }
    return this.supervisorRepository.save(this.supervisorRepository.create({ ...input, businessScope, isActive: input.isActive ?? true }));
  }

  listActions(moduleCode?: string, businessScope: BusinessScope = BusinessScope.BEILUN): Promise<ActionConfig[]> {
    return this.actionRepository.find({ where: { businessScope, ...(moduleCode ? { moduleCode } : {}) }, order: { moduleCode: 'ASC', actionCode: 'ASC' } });
  }

  async saveAction(input: Partial<ActionConfig> & { moduleCode: string; actionCode: string; actionName: string; businessScope?: BusinessScope }): Promise<ActionConfig> {
    const businessScope = input.businessScope ?? BusinessScope.BEILUN;
    const existed = await this.actionRepository.findOne({ where: { moduleCode: input.moduleCode, actionCode: input.actionCode, businessScope } });
    if (existed) {
      Object.assign(existed, input, { businessScope, isActive: input.isActive ?? existed.isActive });
      return this.actionRepository.save(existed);
    }
    return this.actionRepository.save(this.actionRepository.create({ ...input, businessScope, isActive: input.isActive ?? true }));
  }
}
