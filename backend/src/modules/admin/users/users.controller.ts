import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Audit } from 'src/common/decorators/audit.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { UsersService } from './users.service';

class UserRoleBindingDto {
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @IsOptional()
  @IsUUID()
  role_id?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  department_id?: string;

  @IsOptional()
  @IsString()
  role_name?: string;

  @IsOptional()
  @IsString()
  roleName?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  is_primary?: boolean;
}

class QueryUsersDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  realName?: string;

  @IsOptional()
  @IsString()
  real_name?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  groupName?: string;

  @IsOptional()
  @IsString()
  group_name?: string;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : value ? [value] : undefined))
  @IsString({ each: true })
  roleCodes?: string[];

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  is_active?: boolean;
}

class CreateUserDto {
  @IsString()
  @Matches(/^[a-zA-Z][a-zA-Z0-9_]{2,31}$/)
  username!: string;

  @IsOptional()
  @IsString()
  realName?: string;

  @IsOptional()
  @IsString()
  real_name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^1[3-9]\d{9}$/)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  avatar_url?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsString()
  groupName?: string;

  @IsOptional()
  @IsString()
  group_name?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  department_id?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserRoleBindingDto)
  roles!: UserRoleBindingDto[];
}

class UpdateUserDto {
  @IsOptional()
  @IsString()
  realName?: string;

  @IsOptional()
  @IsString()
  real_name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^1[3-9]\d{9}$/)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  avatar_url?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsString()
  groupName?: string;

  @IsOptional()
  @IsString()
  group_name?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  department_id?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserRoleBindingDto)
  roles?: UserRoleBindingDto[];
}

class ResetPasswordDto {
  @IsString()
  @MinLength(6)
  newPassword!: string;
}

class BindRolesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserRoleBindingDto)
  roles!: UserRoleBindingDto[];
}

@Controller('users')
export class TeamUsersController {
  constructor(private readonly service: UsersService) {}

  @Get('by-team/:teamCode')
  byTeam(@Param('teamCode') teamCode: string) {
    return this.service.listByTeam(teamCode);
  }
}

@Roles('admin')
@Controller('admin/users')
@UseInterceptors(AuditInterceptor)
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  list(@Query() query: QueryUsersDto) {
    return this.service.list(query);
  }

  @Post()
  @Audit('users', 'create')
  create(@Body() payload: CreateUserDto) {
    return this.service.create(payload);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @Put(':id')
  @Audit('users', 'update')
  update(@Param('id') id: string, @Body() payload: UpdateUserDto) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  @Audit('users', 'delete')
  disable(@Param('id') id: string) {
    return this.service.disable(id);
  }

  @Post(':id/reset-password')
  @Audit('users', 'reset-password')
  resetPassword(@Param('id') id: string, @Body() payload: ResetPasswordDto) {
    return this.service.resetPassword(id, payload.newPassword);
  }

  @Post(':id/roles')
  @Audit('users', 'bind-role')
  bindRoles(@Param('id') id: string, @Body() payload: BindRolesDto) {
    return this.service.bindRoles(id, payload.roles);
  }

  @Delete(':id/roles/:roleId')
  @Audit('users', 'unbind-role')
  unbindRole(@Param('id') id: string, @Param('roleId') roleId: string) {
    return this.service.unbindRole(id, roleId);
  }
}
