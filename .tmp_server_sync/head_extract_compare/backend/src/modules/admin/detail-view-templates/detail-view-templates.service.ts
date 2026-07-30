import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DetailViewTemplate } from 'src/entities';

@Injectable()
export class DetailViewTemplatesService {
  constructor(
    @InjectRepository(DetailViewTemplate)
    private readonly repo: Repository<DetailViewTemplate>,
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
    const entity = this.repo.create(payload);
    return this.repo.save(entity);
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
    Object.assign(item, payload);
    return this.repo.save(item);
  }

  async remove(id: string) {
    const item = await this.get(id);
    await this.repo.remove(item);
    return { success: true };
  }
}
