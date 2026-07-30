import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Department, UserRole } from 'src/entities';

interface SaveDepartmentInput {
  code: string;
  name: string;
  parentId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,
  ) {}

  async getTree(): Promise<Array<Record<string, unknown>>> {
    const rows = await this.departmentRepository.find({
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });

    const byParent = new Map<string | null, Department[]>();
    rows.forEach((row) => {
      const key = row.parentId ?? null;
      const existing = byParent.get(key) ?? [];
      existing.push(row);
      byParent.set(key, existing);
    });

    const toNode = (item: Department): Record<string, unknown> => ({
      id: item.id,
      code: item.code,
      name: item.name,
      parentId: item.parentId,
      sortOrder: item.sortOrder,
      isActive: item.isActive,
      children: (byParent.get(item.id) ?? []).map(toNode),
    });

    return (byParent.get(null) ?? []).map(toNode);
  }

  async create(input: SaveDepartmentInput): Promise<Department> {
    const existed = await this.departmentRepository.findOne({
      where: { code: input.code },
    });
    if (existed) {
      throw new BadRequestException('部门编码已存在');
    }

    if (input.parentId) {
      await this.assertDepartmentExists(input.parentId);
    }

    const entity = this.departmentRepository.create({
      code: input.code,
      name: input.name,
      parentId: input.parentId ?? null,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    });

    return this.departmentRepository.save(entity);
  }

  async update(id: string, input: Partial<SaveDepartmentInput>): Promise<Department> {
    const row = await this.assertDepartmentExists(id);

    if (input.code && input.code !== row.code) {
      const existed = await this.departmentRepository.findOne({
        where: { code: input.code },
      });
      if (existed) {
        throw new BadRequestException('部门编码已存在');
      }
    }

    if (input.parentId && input.parentId !== row.parentId) {
      await this.assertDepartmentExists(input.parentId);
      await this.assertNoLoop(id, input.parentId);
    }

    Object.assign(row, {
      code: input.code ?? row.code,
      name: input.name ?? row.name,
      parentId: input.parentId ?? row.parentId,
      sortOrder: input.sortOrder ?? row.sortOrder,
      isActive: input.isActive ?? row.isActive,
    });

    return this.departmentRepository.save(row);
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const row = await this.assertDepartmentExists(id);

    const childCount = await this.departmentRepository.count({
      where: { parentId: id },
    });
    if (childCount > 0) {
      throw new BadRequestException('存在子部门，不能删除');
    }

    const userCount = await this.userRoleRepository.count({
      where: { departmentId: id },
    });
    if (userCount > 0) {
      throw new BadRequestException('部门仍关联用户，不能删除');
    }

    row.isActive = false;
    await this.departmentRepository.save(row);
    return { success: true };
  }

  async move(
    id: string,
    payload: { parentId: string | null; sortOrder?: number },
  ): Promise<Department> {
    const row = await this.assertDepartmentExists(id);

    if (payload.parentId) {
      await this.assertDepartmentExists(payload.parentId);
      await this.assertNoLoop(id, payload.parentId);
    }

    row.parentId = payload.parentId;
    row.sortOrder = payload.sortOrder ?? row.sortOrder;
    return this.departmentRepository.save(row);
  }

  private async assertDepartmentExists(id: string): Promise<Department> {
    const row = await this.departmentRepository.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('部门不存在');
    }
    return row;
  }

  private async assertNoLoop(id: string, parentId: string): Promise<void> {
    let current: Department | null = await this.departmentRepository.findOne({
      where: { id: parentId },
    });

    while (current) {
      if (current.id === id) {
        throw new BadRequestException('部门移动会形成循环');
      }

      if (!current.parentId) {
        return;
      }

      current = await this.departmentRepository.findOne({
        where: { id: current.parentId },
      });
    }
  }
}
