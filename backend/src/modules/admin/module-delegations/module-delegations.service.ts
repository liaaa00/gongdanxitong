import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { canHandleModule, getRequiredModuleHandlerRoles } from 'src/common/auth/role-permissions';
import { ModuleHandler, ModuleHandlerDelegation, User } from 'src/entities';

export interface CreateModuleDelegationInput {
  moduleCode: string;
  sourceHandlerId: string;
  delegateHandlerId?: string | null;
  startsAt: string;
  endsAt: string;
  reason: string;
}

@Injectable()
export class ModuleDelegationsService {
  constructor(
    @InjectRepository(ModuleHandlerDelegation)
    private readonly repository: Repository<ModuleHandlerDelegation>,
    @InjectRepository(ModuleHandler)
    private readonly handlerRepository: Repository<ModuleHandler>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  list(moduleCode?: string, includeInactive = false): Promise<ModuleHandlerDelegation[]> {
    return this.repository.find({
      where: {
        ...(moduleCode ? { moduleCode } : {}),
        ...(!includeInactive ? { isActive: true } : {}),
      },
      relations: { sourceHandler: true, delegateHandler: true },
      order: { startsAt: 'DESC', createdAt: 'DESC' },
    });
  }

  async create(input: CreateModuleDelegationInput, createdBy: string): Promise<ModuleHandlerDelegation> {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
      throw new BadRequestException('代理结束时间必须晚于开始时间');
    }
    if (input.delegateHandlerId && input.delegateHandlerId === input.sourceHandlerId) {
      throw new BadRequestException('代理人不能与原负责人相同');
    }

    const source = await this.handlerRepository.findOne({
      where: { moduleCode: input.moduleCode, handlerId: input.sourceHandlerId, isActive: true },
    });
    if (!source) throw new BadRequestException('原负责人未配置在该模块或已停用');

    if (input.delegateHandlerId) {
      const delegate = await this.userRepository.findOne({
        where: { id: input.delegateHandlerId, isActive: true },
        relations: { userRoles: { role: true } },
      });
      if (!delegate) throw new BadRequestException('代理人不存在或已停用');
      const roles = delegate.userRoles
        .filter((binding) => binding.role?.isActive)
        .map((binding) => binding.role.code);
      if (!canHandleModule(input.moduleCode, roles)) {
        const required = getRequiredModuleHandlerRoles(input.moduleCode);
        throw new BadRequestException(`代理人缺少模块 ${input.moduleCode} 所需角色：${required.join('、')}`);
      }
    }

    const overlap = await this.repository.createQueryBuilder('delegation')
      .where('delegation.module_code = :moduleCode', { moduleCode: input.moduleCode })
      .andWhere('delegation.source_handler_id = :sourceHandlerId', { sourceHandlerId: input.sourceHandlerId })
      .andWhere('delegation.is_active = true')
      .andWhere('delegation.starts_at < :endsAt', { endsAt })
      .andWhere('delegation.ends_at > :startsAt', { startsAt })
      .getOne();
    if (overlap) throw new BadRequestException('该负责人在所选时间段已有代理或暂停安排');

    return this.repository.save(this.repository.create({
      moduleCode: input.moduleCode,
      sourceHandlerId: input.sourceHandlerId,
      delegateHandlerId: input.delegateHandlerId ?? null,
      startsAt,
      endsAt,
      reason: input.reason.trim(),
      isActive: true,
      createdBy,
    }));
  }

  async cancel(id: string): Promise<{ success: boolean }> {
    const row = await this.repository.findOne({ where: { id } });
    if (!row) throw new NotFoundException('代理记录不存在');
    row.isActive = false;
    await this.repository.save(row);
    return { success: true };
  }
}
