import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, In, Repository } from 'typeorm';
import { canHandleModule } from 'src/common/auth/role-permissions';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { toPageResult } from 'src/common/types/pagination.types';
import { BusinessScope, Department, DispatchedOrder, DispatchedOrderStatus, ModuleHandler, Role, User, UserRole } from 'src/entities';

interface UserRoleBindingInput {
  roleId?: string;
  role_id?: string;
  roleName?: string;
  role_name?: string;
  departmentId?: string;
  department_id?: string;
  isPrimary?: boolean;
  is_primary?: boolean;
}

interface NormalizedUserRoleBindingInput {
  roleId: string;
  departmentId: string;
  isPrimary: boolean;
}

interface CreateUserInput {
  username: string;
  realName?: string;
  real_name?: string;
  phone?: string;
  email?: string;
  password: string;
  avatarUrl?: string;
  avatar_url?: string;
  isActive?: boolean;
  is_active?: boolean;
  groupName?: string;
  group_name?: string;
  departmentId?: string;
  department_id?: string;
  businessScope?: BusinessScope;
  business_scope?: BusinessScope;
  roles: UserRoleBindingInput[];
}

interface UpdateUserInput {
  username?: string;
  realName?: string;
  real_name?: string;
  phone?: string;
  email?: string;
  password?: string;
  avatarUrl?: string;
  avatar_url?: string;
  isActive?: boolean;
  is_active?: boolean;
  groupName?: string;
  group_name?: string;
  departmentId?: string;
  department_id?: string;
  businessScope?: BusinessScope;
  business_scope?: BusinessScope;
  roles?: UserRoleBindingInput[];
}

interface UserRoleView {
  role_id: string;
  roleId: string;
  role_name: string;
  roleName: string;
  role_code: string;
  roleCode: string;
  department_id: string;
  departmentId: string;
  department_name: string;
  departmentName: string;
  is_primary: boolean;
  isPrimary: boolean;
  role: {
    id: string;
    code: string;
    name: string;
  };
  department: {
    id: string;
    code: string;
    name: string;
  };
}

export interface UserView {
  id: string;
  username: string;
  userName: string;
  realName: string;
  real_name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  avatar_url: string | null;
  isActive: boolean;
  is_active: boolean;
  lastLoginAt: Date | null;
  last_login_at: Date | null;
  createdAt: Date;
  created_at: Date;
  roles: UserRoleView[];
  userRoles: UserRole[];
  user_roles: UserRoleView[];
  roleCodes: string[];
  role_codes: string[];
  roleNames: string[];
  role_names: string[];
  groupName: string;
  group_name: string;
  departmentName: string;
  department_name: string;
  departmentId: string | null;
  department_id: string | null;
  position: string;
  businessScope: BusinessScope;
  business_scope: BusinessScope;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,
    @InjectRepository(DispatchedOrder)
    private readonly dispatchedOrderRepository: Repository<DispatchedOrder>,
    @Optional()
    @InjectRepository(ModuleHandler)
    private readonly moduleHandlerRepository?: Repository<ModuleHandler>,
  ) {}

  async list(
    query: PaginationQueryDto & {
      username?: string;
      realName?: string;
      real_name?: string;
      email?: string;
      phone?: string;
      groupName?: string;
      group_name?: string;
      roleCodes?: string[];
      departmentId?: string;
      isActive?: boolean;
      is_active?: boolean;
    },
  ) {
    const page = query.current ?? query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const qb = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.userRoles', 'userRole')
      .leftJoinAndSelect('userRole.role', 'role')
      .leftJoinAndSelect('userRole.department', 'department')
      .distinct(true);

    if (query.keyword) {
      qb.andWhere(
        '(user.username ILIKE :keyword OR user.realName ILIKE :keyword OR user.phone ILIKE :keyword OR user.email ILIKE :keyword)',
        {
          keyword: `%${query.keyword}%`,
        },
      );
    }

    if (query.username) {
      qb.andWhere('user.username ILIKE :username', {
        username: `%${query.username}%`,
      });
    }

    const realName = query.realName ?? query.real_name;
    if (realName) {
      qb.andWhere('user.realName ILIKE :realName', {
        realName: `%${realName}%`,
      });
    }

    if (query.email) {
      qb.andWhere('user.email ILIKE :email', { email: `%${query.email}%` });
    }

    if (query.phone) {
      qb.andWhere('user.phone ILIKE :phone', { phone: `%${query.phone}%` });
    }

    const groupName = query.groupName ?? query.group_name;
    if (groupName) {
      qb.andWhere('department.name ILIKE :groupName', {
        groupName: `%${groupName}%`,
      });
    }

    const isActive = query.isActive ?? query.is_active;
    if (typeof isActive === 'boolean') {
      qb.andWhere('user.isActive = :isActive', { isActive });
    }

    if (query.roleCodes && query.roleCodes.length > 0) {
      qb.andWhere('role.code IN (:...roleCodes)', { roleCodes: query.roleCodes });
    }

    if (query.departmentId) {
      qb.andWhere('department.id = :departmentId', {
        departmentId: query.departmentId,
      });
    }

    qb.orderBy('user.createdAt', 'DESC');

    const [rows, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return toPageResult(page, pageSize, total, rows.map((row) => this.toView(row)));
  }

  async listByTeam(teamCode: string): Promise<Array<{
    id: string;
    username: string;
    realName: string;
    real_name: string;
    nodeType: string;
    node_type: string;
    handlerRole: string;
    handler_role: string;
    position: string;
    departmentName: string;
    department_name: string;
    roleCodes: string[];
    role_codes: string[];
    isActive: boolean;
    is_active: boolean;
    isOnDuty: boolean;
    is_on_duty: boolean;
  }>> {
    const normalized = teamCode.trim();
    if (!normalized) {
      return [];
    }

    const moduleUsers = await this.userRepository
      .createQueryBuilder('user')
      .innerJoin('module_handlers', 'mh', 'mh.handler_id = user.id AND mh.module_code = :teamCode AND mh.is_active = true', { teamCode: normalized })
      .leftJoinAndSelect('user.userRoles', 'userRole')
      .leftJoinAndSelect('userRole.role', 'role')
      .leftJoinAndSelect('userRole.department', 'department')
      .where('user.isActive = true')
      .orderBy('mh.is_backup', 'ASC')
      .addOrderBy('mh.weight', 'DESC')
      .getMany();

    const rows = moduleUsers.length > 0
      ? moduleUsers
      : await this.userRepository
        .createQueryBuilder('user')
        .leftJoinAndSelect('user.userRoles', 'userRole')
        .leftJoinAndSelect('userRole.role', 'role')
        .leftJoinAndSelect('userRole.department', 'department')
        .where('user.isActive = true')
        .andWhere('(user.groupCode = :teamCode OR department.code = :teamCode OR department.name = :teamCode)', { teamCode: normalized })
        .orderBy('user.realName', 'ASC')
        .getMany();

    return rows.map((row) => {
      const view = this.toView(row);
      return {
        id: view.id,
        username: view.username,
        realName: view.realName,
        real_name: view.real_name,
        nodeType: normalized,
        node_type: normalized,
        handlerRole: view.position,
        handler_role: view.position,
        position: view.position,
        departmentName: view.departmentName,
        department_name: view.department_name,
        roleCodes: view.roleCodes,
        role_codes: view.role_codes,
        isActive: view.isActive,
        is_active: view.is_active,
        isOnDuty: view.isActive,
        is_on_duty: view.is_active,
      };
    });
  }

  async detail(id: string): Promise<UserView> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: {
        userRoles: {
          role: true,
          department: true,
        },
      },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return this.toView(user);
  }

  async create(input: CreateUserInput): Promise<UserView> {
    const roles = await this.normalizeRoleBindings(input.roles, input);
    this.validateRoleBindings(roles);

    const exists = await this.userRepository.findOne({
      where: { username: input.username },
    });
    if (exists) {
      throw new BadRequestException('用户名已存在');
    }

    if (input.email) {
      const emailExists = await this.userRepository.findOne({
        where: { email: input.email },
      });
      if (emailExists) {
        throw new BadRequestException('邮箱已存在');
      }
    }

    const roleIds = roles.map((item) => item.roleId);
    const departmentIds = roles.map((item) => item.departmentId);

    const roleEntities = await this.roleRepository.findBy({ id: In(roleIds), isActive: true });
    const departments = await this.departmentRepository.findBy({
      id: In(departmentIds),
      isActive: true,
    });

    if (roleEntities.length !== new Set(roleIds).size || departments.length !== new Set(departmentIds).size) {
      throw new BadRequestException('角色或部门不存在/未启用');
    }

    const createdUserId = await this.dataSource.transaction(async (manager) => {
      const user = await manager.save(
        User,
        manager.create(User, {
          username: input.username,
          realName: this.requireRealName(input),
          phone: input.phone ?? null,
          email: input.email ?? null,
          avatarUrl: input.avatarUrl ?? input.avatar_url ?? null,
          isActive: input.isActive ?? input.is_active ?? true,
          businessScope: input.businessScope ?? input.business_scope ?? BusinessScope.BEILUN,
          passwordHash: await bcrypt.hash(input.password, 10),
        }),
      );

      for (const roleBinding of roles) {
        await manager.save(
          UserRole,
          manager.create(UserRole, {
            userId: user.id,
            roleId: roleBinding.roleId,
            departmentId: roleBinding.departmentId,
            isPrimary: roleBinding.isPrimary,
          }),
        );
      }

      return user.id;
    });

    return this.detail(createdUserId);
  }

  async update(id: string, input: UpdateUserInput): Promise<UserView> {
    const current = await this.loadEntity(id);

    const nextUsername = input.username?.trim();
    const usernameChanged = Boolean(nextUsername && nextUsername !== current.username);
    if (usernameChanged) {
      const usernameExists = await this.userRepository.findOne({
        where: { username: nextUsername },
      });
      if (usernameExists && usernameExists.id !== id) {
        throw new BadRequestException('用户名已存在');
      }
    }

    const nextIsActive = input.isActive ?? input.is_active;
    const isDeactivating = current.isActive && nextIsActive === false;
    if (isDeactivating) {
      await this.assertNoProcessingDispatchedOrders(id);
    }

    if (input.email && input.email !== current.email) {
      const emailExists = await this.userRepository.findOne({
        where: { email: input.email },
      });
      if (emailExists && emailExists.id !== id) {
        throw new BadRequestException('邮箱已存在');
      }
    }

    Object.assign(current, {
      username: nextUsername || current.username,
      realName: input.realName ?? input.real_name ?? current.realName,
      phone: input.phone ?? current.phone,
      email: input.email ?? current.email,
      avatarUrl: input.avatarUrl ?? input.avatar_url ?? current.avatarUrl,
      isActive: input.isActive ?? input.is_active ?? current.isActive,
      businessScope: input.businessScope ?? input.business_scope ?? current.businessScope ?? BusinessScope.BEILUN,
    });

    if (usernameChanged || isDeactivating) {
      current.authVersion = (current.authVersion ?? 0) + 1;
    }

    if (input.password?.trim()) {
      current.passwordHash = await bcrypt.hash(input.password.trim(), 10);
      current.mustChangePassword = true;
      current.passwordUpdatedAt = null;
      current.authVersion = (current.authVersion ?? 0) + 1;
    }

    await this.userRepository.save(current);

    if (input.roles) {
      const roles = await this.normalizeRoleBindings(input.roles, input);
      this.validateRoleBindings(roles);
      await this.assertHandlerRoleCompatibility(id, roles.map((role) => role.roleId));

      await this.dataSource.transaction(async (manager) => {
        await manager.delete(UserRole, { userId: id });

        for (const roleBinding of roles) {
          await manager.save(
            UserRole,
            manager.create(UserRole, {
              userId: id,
              roleId: roleBinding.roleId,
              departmentId: roleBinding.departmentId,
              isPrimary: roleBinding.isPrimary,
            }),
          );
        }
      });
    }

    return this.detail(id);
  }

  async disable(id: string): Promise<{ success: boolean }> {
    const user = await this.loadEntity(id);
    await this.assertNoProcessingDispatchedOrders(id);

    user.isActive = false;
    user.authVersion = (user.authVersion ?? 0) + 1;
    await this.userRepository.save(user);
    return { success: true };
  }

  async resetPassword(
    id: string,
    newPassword: string,
  ): Promise<{ success: boolean }> {
    const user = await this.loadEntity(id);

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = true;
    user.passwordUpdatedAt = null;
    user.authVersion = (user.authVersion ?? 0) + 1;
    await this.userRepository.save(user);

    return { success: true };
  }

  async forceLogout(id: string): Promise<{ success: boolean }> {
    const user = await this.loadEntity(id);
    user.authVersion = (user.authVersion ?? 0) + 1;
    await this.userRepository.save(user);
    return { success: true };
  }

  async bindRoles(
    userId: string,
    rolesInput: UserRoleBindingInput[],
  ): Promise<UserView> {
    await this.loadEntity(userId);
    const roles = await this.normalizeRoleBindings(rolesInput, {});
    this.validateRoleBindings(roles);

    await this.dataSource.transaction(async (manager) => {
      for (const roleBinding of roles) {
        const existed = await manager.findOne(UserRole, {
          where: {
            userId,
            roleId: roleBinding.roleId,
            departmentId: roleBinding.departmentId,
          },
        });

        if (existed) {
          existed.isPrimary = roleBinding.isPrimary;
          await manager.save(UserRole, existed);
          continue;
        }

        await manager.save(
          UserRole,
          manager.create(UserRole, {
            userId,
            roleId: roleBinding.roleId,
            departmentId: roleBinding.departmentId,
            isPrimary: roleBinding.isPrimary,
          }),
        );
      }
    });

    return this.detail(userId);
  }

  async unbindRole(userId: string, roleId: string): Promise<{ success: boolean }> {
    await this.loadEntity(userId);
    const bindings = await this.userRoleRepository.find({ where: { userId } });
    const remainingRoleIds = Array.from(new Set(
      bindings.filter((binding) => binding.roleId !== roleId).map((binding) => binding.roleId),
    ));
    await this.assertHandlerRoleCompatibility(userId, remainingRoleIds);
    await this.userRoleRepository.delete({ userId, roleId });
    return { success: true };
  }

  private async loadEntity(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    return user;
  }

  private toView(user: User): UserView {
    const sortedUserRoles = [...(user.userRoles ?? [])].sort((left, right) => {
      if (left.isPrimary === right.isPrimary) return 0;
      return left.isPrimary ? -1 : 1;
    });

    const roles: UserRoleView[] = sortedUserRoles
      .filter((userRole) => userRole.role && userRole.department)
      .map((userRole) => ({
        role_id: userRole.roleId,
        roleId: userRole.roleId,
        role_name: userRole.role.name,
        roleName: userRole.role.name,
        role_code: userRole.role.code,
        roleCode: userRole.role.code,
        department_id: userRole.departmentId,
        departmentId: userRole.departmentId,
        department_name: userRole.department.name,
        departmentName: userRole.department.name,
        is_primary: userRole.isPrimary,
        isPrimary: userRole.isPrimary,
        role: {
          id: userRole.role.id,
          code: userRole.role.code,
          name: userRole.role.name,
        },
        department: {
          id: userRole.department.id,
          code: userRole.department.code,
          name: userRole.department.name,
        },
      }));

    const primary = roles.find((role) => role.is_primary) ?? roles[0];
    const roleCodes = Array.from(new Set(roles.map((role) => role.role_code).filter(Boolean)));
    const roleNames = Array.from(new Set(roles.map((role) => role.role_name).filter(Boolean)));

    return {
      id: user.id,
      username: user.username,
      userName: user.username,
      realName: user.realName,
      real_name: user.realName,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      avatar_url: user.avatarUrl,
      isActive: user.isActive,
      is_active: user.isActive,
      lastLoginAt: user.lastLoginAt,
      last_login_at: user.lastLoginAt,
      createdAt: user.createdAt,
      created_at: user.createdAt,
      roles,
      userRoles: sortedUserRoles,
      user_roles: roles,
      roleCodes,
      role_codes: roleCodes,
      roleNames,
      role_names: roleNames,
      groupName: primary?.department_name ?? '',
      group_name: primary?.department_name ?? '',
      departmentName: primary?.department_name ?? '',
      department_name: primary?.department_name ?? '',
      departmentId: primary?.department_id ?? null,
      department_id: primary?.department_id ?? null,
      position: roleNames[0] ?? '',
      businessScope: user.businessScope ?? BusinessScope.BEILUN,
      business_scope: user.businessScope ?? BusinessScope.BEILUN,
    };
  }

  private async normalizeRoleBindings(
    roles: UserRoleBindingInput[],
    ownerInput: { groupName?: string; group_name?: string; departmentId?: string; department_id?: string },
  ): Promise<NormalizedUserRoleBindingInput[]> {
    if (!Array.isArray(roles)) {
      return [];
    }

    const fallbackDepartmentId = await this.resolveDepartmentIdFromInput(ownerInput);
    const normalized: NormalizedUserRoleBindingInput[] = [];

    for (const item of roles) {
      const roleId = item.roleId ?? item.role_id;
      if (!roleId) {
        throw new BadRequestException('角色信息缺失');
      }
      const departmentId = item.departmentId ?? item.department_id ?? fallbackDepartmentId;
      if (!departmentId) {
        throw new BadRequestException('部门信息缺失，请先选择部门/小组');
      }
      normalized.push({
        roleId,
        departmentId,
        isPrimary: item.isPrimary ?? item.is_primary ?? false,
      });
    }

    if (normalized.length === 1 && !normalized[0].isPrimary) {
      normalized[0].isPrimary = true;
    }

    return normalized;
  }

  private async resolveDepartmentIdFromInput(input: { groupName?: string; group_name?: string; departmentId?: string; department_id?: string }): Promise<string | undefined> {
    const explicitId = input.departmentId ?? input.department_id;
    if (explicitId) {
      return explicitId;
    }

    const groupName = (input.groupName ?? input.group_name)?.trim();
    if (!groupName) {
      return undefined;
    }

    const department = await this.departmentRepository.findOne({
      where: { name: groupName, isActive: true },
    });
    return department?.id;
  }

  private requireRealName(input: CreateUserInput): string {
    const realName = input.realName ?? input.real_name;
    if (!realName?.trim()) {
      throw new BadRequestException('姓名不能为空');
    }
    return realName.trim();
  }

  private validateRoleBindings(roles: NormalizedUserRoleBindingInput[]): void {
    if (!Array.isArray(roles) || roles.length === 0) {
      throw new BadRequestException('至少绑定一个角色');
    }

    const primaryCount = roles.filter((item) => item.isPrimary).length;
    if (primaryCount !== 1) {
      throw new BadRequestException('必须且仅有一个主角色');
    }

    const unique = new Set(roles.map((item) => `${item.roleId}:${item.departmentId}`));
    if (unique.size !== roles.length) {
      throw new BadRequestException('角色+部门组合不能重复');
    }
  }

  private async assertHandlerRoleCompatibility(userId: string, roleIds: string[]): Promise<void> {
    if (!this.moduleHandlerRepository) return;
    const handlers = await this.moduleHandlerRepository.find({
      where: { handlerId: userId, isActive: true },
    });
    if (handlers.length === 0) return;

    const roles = roleIds.length > 0
      ? await this.roleRepository.findBy({ id: In(roleIds), isActive: true })
      : [];
    const roleCodes = roles.map((role) => role.code);
    const incompatibleModules = Array.from(new Set(
      handlers
        .map((handler) => handler.moduleCode)
        .filter((moduleCode) => !canHandleModule(moduleCode, roleCodes)),
    ));
    if (incompatibleModules.length > 0) {
      throw new BadRequestException(`该用户仍是以下模块负责人，请先完成交接再移除角色：${incompatibleModules.join('、')}`);
    }
  }

  private async assertNoProcessingDispatchedOrders(userId: string): Promise<void> {
    const count = await this.dispatchedOrderRepository.count({
      where: {
        handlerId: userId,
        status: In([
          DispatchedOrderStatus.PENDING,
          DispatchedOrderStatus.PROCESSING,
          DispatchedOrderStatus.MODIFY_PENDING,
          DispatchedOrderStatus.RETURNED,
          DispatchedOrderStatus.WITHDRAW_PENDING,
          DispatchedOrderStatus.VOID_PENDING,
        ]),
      },
    });

    if (count > 0) {
      throw new BadRequestException('该用户仍有未完成子工单，请先完成离职交接');
    }
  }
}
