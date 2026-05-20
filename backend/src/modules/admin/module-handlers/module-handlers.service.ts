import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModuleHandler } from 'src/entities';

@Injectable()
export class ModuleHandlersService {
  constructor(
    @InjectRepository(ModuleHandler)
    private readonly repository: Repository<ModuleHandler>,
  ) {}

  async list(moduleCode?: string, isActive?: boolean): Promise<ModuleHandler[]> {
    return this.repository.find({
      where: {
        ...(moduleCode ? { moduleCode } : {}),
        ...(typeof isActive === 'boolean' ? { isActive } : {}),
      },
      order: { moduleCode: 'ASC', weight: 'DESC' },
    });
  }

  async create(input: {
    moduleCode: string;
    handlerId: string;
    weight?: number;
    isBackup?: boolean;
    isActive?: boolean;
  }): Promise<ModuleHandler> {
    const entity = this.repository.create({
      moduleCode: input.moduleCode,
      handlerId: input.handlerId,
      weight: input.weight ?? 1,
      isBackup: input.isBackup ?? false,
      isActive: input.isActive ?? true,
    });

    return this.repository.save(entity);
  }

  async update(
    id: string,
    input: Partial<{
      moduleCode: string;
      handlerId: string;
      weight: number;
      isBackup: boolean;
      isActive: boolean;
    }>,
  ): Promise<ModuleHandler> {
    const row = await this.repository.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('module handler 不存在');
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
}
