import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { canHandleModule, getRequiredModuleHandlerRoles } from 'src/common/auth/role-permissions';
import { ModuleHandler, User } from 'src/entities';

interface SaveModuleHandlerInput {
  moduleCode: string;
  handlerId: string;
  weight?: number;
  isBackup?: boolean;
  isActive?: boolean;
}

@Injectable()
export class ModuleHandlersService {
  constructor(
    @InjectRepository(ModuleHandler)
    private readonly repository: Repository<ModuleHandler>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async list(moduleCode?: string, isActive?: boolean): Promise<ModuleHandler[]> {
    return this.repository.find({
      where: {
        ...(moduleCode ? { moduleCode } : {}),
        ...(typeof isActive === 'boolean' ? { isActive } : {}),
      },
      relations: { handler: { userRoles: { role: true } } },
      order: { moduleCode: 'ASC', weight: 'DESC' },
    });
  }

  async create(input: SaveModuleHandlerInput): Promise<ModuleHandler> {
    await this.assertEligible(input.moduleCode, input.handlerId);
    const existed = await this.repository.findOne({
      where: { moduleCode: input.moduleCode, handlerId: input.handlerId },
    });
    if (existed) {
      Object.assign(existed, {
        weight: input.weight ?? existed.weight,
        isBackup: input.isBackup ?? existed.isBackup,
        isActive: input.isActive ?? true,
      });
      return this.repository.save(existed);
    }

    return this.repository.save(this.repository.create({
      moduleCode: input.moduleCode,
      handlerId: input.handlerId,
      weight: input.weight ?? 1,
      isBackup: input.isBackup ?? false,
      isActive: input.isActive ?? true,
    }));
  }

  async update(id: string, input: Partial<SaveModuleHandlerInput>): Promise<ModuleHandler> {
    const row = await this.repository.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('module handler 不存在');
    }

    const moduleCode = input.moduleCode ?? row.moduleCode;
    const handlerId = input.handlerId ?? row.handlerId;
    await this.assertEligible(moduleCode, handlerId);
    const duplicate = await this.repository.findOne({ where: { moduleCode, handlerId } });
    if (duplicate && duplicate.id !== id) {
      throw new BadRequestException('该用户已是此模块负责人');
    }

    Object.assign(row, input);
    return this.repository.save(row);
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const row = await this.repository.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('module handler 不存在');
    }

    row.isActive = false;
    await this.repository.save(row);
    return { success: true };
  }

  private async assertEligible(moduleCode: string, handlerId: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: handlerId, isActive: true },
      relations: { userRoles: { role: true } },
    });
    if (!user) {
      throw new BadRequestException('负责人账号不存在或已停用');
    }

    const roleCodes = user.userRoles
      .filter((binding) => binding.role?.isActive)
      .map((binding) => binding.role.code);
    if (!canHandleModule(moduleCode, roleCodes)) {
      const required = getRequiredModuleHandlerRoles(moduleCode);
      throw new BadRequestException(`该用户缺少模块 ${moduleCode} 所需角色：${required.join('、')}`);
    }
  }
}
