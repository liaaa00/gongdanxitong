import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { toPageResult } from 'src/common/types/pagination.types';
import { FieldPermission, Role, RoleLevel, UserRole } from 'src/entities';

interface SaveRoleInput {
  code: string;
  name: string;
  level: RoleLevel;
  description?: string;
  isActive?: boolean;
}

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,
    @InjectRepository(FieldPermission)
    private readonly fieldPermissionRepository: Repository<FieldPermission>,
  ) {}

  async list(query: PaginationQueryDto & { isActive?: boolean }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const qb = this.roleRepository.createQueryBuilder('role');

    if (query.keyword) {
      qb.andWhere('(role.code ILIKE :keyword OR role.name ILIKE :keyword)', {
        keyword: `%${query.keyword}%`,
      });
    }

    // 默认只返回活跃角色，除非明确指定 isActive=false
    if (typeof query.isActive === 'boolean') {
      qb.andWhere('role.isActive = :isActive', { isActive: query.isActive });
    } else {
      // 默认只显示活跃角色
      qb.andWhere('role.isActive = :isActive', { isActive: true });
    }

    qb.orderBy('role.createdAt', 'DESC');

    const [rows, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return toPageResult(page, pageSize, total, rows);
  }

  async create(input: SaveRoleInput): Promise<Role> {
    const existed = await this.roleRepository.findOne({ where: { code: input.code } });
    if (existed) {
      throw new BadRequestException('角色编码已存在');
    }

    const role = this.roleRepository.create({
      ...input,
      isActive: input.isActive ?? true,
      description: input.description ?? null,
    });

    return this.roleRepository.save(role);
  }

  async update(id: string, input: Partial<SaveRoleInput>): Promise<Role> {
    const role = await this.roleRepository.findOne({ where: { id } });
    if (!role) {
      throw new NotFoundException('角色不存在');
    }

    if (input.code && input.code !== role.code) {
      const codeExists = await this.roleRepository.findOne({
        where: { code: input.code },
      });
      if (codeExists) {
        throw new BadRequestException('角色编码已存在');
      }
    }

    Object.assign(role, input);
    return this.roleRepository.save(role);
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const role = await this.roleRepository.findOne({ where: { id } });
    if (!role) {
      throw new NotFoundException('角色不存在');
    }

    const userRefs = await this.userRoleRepository.count({ where: { roleId: id } });
    if (userRefs > 0) {
      throw new BadRequestException('角色被用户引用，无法删除');
    }

    const permissionRefs = await this.fieldPermissionRepository.count({
      where: { roleId: id },
    });
    if (permissionRefs > 0) {
      throw new BadRequestException('角色被字段权限引用，无法删除');
    }

    role.isActive = false;
    await this.roleRepository.save(role);
    return { success: true };
  }

  async findByIds(ids: string[]): Promise<Role[]> {
    return this.roleRepository.findBy({ id: In(ids), isActive: true });
  }
}
