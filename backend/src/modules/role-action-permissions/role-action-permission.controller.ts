import { Body, Controller, Get, Put } from '@nestjs/common';
import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { RoleActionPermissionMatrix, RoleActionPermissionService } from './role-action-permission.service';

class UpdateRoleActionPermissionsDto {
  @IsObject()
  roles!: RoleActionPermissionMatrix;
}

class UpdateCurrentRoleActionDto {
  @IsString()
  roleCode!: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  actions?: string[];
}

@Controller()
export class RoleActionPermissionController {
  constructor(private readonly service: RoleActionPermissionService) {}

  @Get('role-action-permissions/me')
  async me(@CurrentUser() user: JwtUserPayload) {
    const actions = await this.service.getAllowedActionsForRoles(user.roles || []);
    return { actions };
  }

  @Get('admin/role-action-permissions')
  @Roles('admin')
  async getAll() {
    return {
      actions: this.service.getActionDefinitions(),
      roles: await this.service.getMatrix(),
    };
  }

  @Put('admin/role-action-permissions')
  @Roles('admin')
  async updateAll(@Body() payload: UpdateRoleActionPermissionsDto) {
    return {
      actions: this.service.getActionDefinitions(),
      roles: await this.service.updateMatrix(payload.roles),
    };
  }

  @Put('admin/role-action-permissions/role')
  @Roles('admin')
  async updateRole(@Body() payload: UpdateCurrentRoleActionDto) {
    return {
      actions: this.service.getActionDefinitions(),
      roles: await this.service.setRolePermissions(payload.roleCode, payload.actions || []),
    };
  }
}
