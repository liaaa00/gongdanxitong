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
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Audit } from 'src/common/decorators/audit.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { BusinessScope } from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { ExecuteUserHandoverDto } from './handover.dto';
import { UserHandoverService } from './user-handover.service';
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

  @IsOptional()
  @IsEnum(BusinessScope)
  businessScope?: BusinessScope;

  @IsOptional()
  @IsEnum(BusinessScope)
  business_scope?: BusinessScope;
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

  @IsOptional()
  @IsEnum(BusinessScope)
  businessScope?: BusinessScope;

  @IsOptional()
  @IsEnum(BusinessScope)
  business_scope?: BusinessScope;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserRoleBindingDto)
  roles!: UserRoleBindingDto[];
}

class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z][a-zA-Z0-9_]{2,31}$/)
  username?: string;

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
  @MinLength(6)
  password?: string;

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
  @IsEnum(BusinessScope)
  businessScope?: BusinessScope;

  @IsOptional()
  @IsEnum(BusinessScope)
  business_scope?: BusinessScope;

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
  constructor(
    private readonly service: UsersService,
    private readonly handoverService: UserHandoverService,
  ) {}

  @Get()
  list(@Query() query: QueryUsersDto, @CurrentUser() user: JwtUserPayload) {
    const businessScope = query.businessScope ?? query.business_scope ?? user.businessScope ?? BusinessScope.BEILUN;
    return this.service.list({ ...query, businessScope, business_scope: businessScope });
  }

  @Post()
  @Audit('users', 'create')
  create(
    @Body() payload: CreateUserDto,
    @Query('businessScope') requestedScope: BusinessScope | undefined,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.create({
      ...payload,
      businessScope: payload.businessScope ?? payload.business_scope ?? requestedScope ?? user.businessScope ?? BusinessScope.BEILUN,
    });
  }

  @Get(':id/handover-preview')
  handoverPreview(
    @Param('id') id: string,
    @Query('businessScope') requestedScope: BusinessScope | undefined,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.handoverService.preview(id, requestedScope ?? user.businessScope ?? BusinessScope.BEILUN);
  }

  @Post(':id/handover')
  handover(
    @Param('id') id: string,
    @Body() payload: ExecuteUserHandoverDto,
    @CurrentUser() user: JwtUserPayload,
    @Query('businessScope') requestedScope: BusinessScope | undefined,
  ) {
    return this.handoverService.execute(id, payload, user.sub, requestedScope ?? user.businessScope ?? BusinessScope.BEILUN);
  }

  @Get(':id')
  detail(
    @Param('id') id: string,
    @Query('businessScope') requestedScope: BusinessScope | undefined,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.detail(id, requestedScope ?? user.businessScope ?? BusinessScope.BEILUN);
  }

  @Put(':id')
  @Audit('users', 'update')
  update(
    @Param('id') id: string,
    @Body() payload: UpdateUserDto,
    @Query('businessScope') requestedScope: BusinessScope | undefined,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.update(id, payload, requestedScope ?? user.businessScope ?? BusinessScope.BEILUN);
  }

  @Delete(':id')
  @Audit('users', 'delete')
  disable(
    @Param('id') id: string,
    @Query('businessScope') requestedScope: BusinessScope | undefined,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.disable(id, requestedScope ?? user.businessScope ?? BusinessScope.BEILUN);
  }

  @Post(':id/reset-password')
  @Audit('users', 'reset-password')
  resetPassword(
    @Param('id') id: string,
    @Body() payload: ResetPasswordDto,
    @Query('businessScope') requestedScope: BusinessScope | undefined,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.resetPassword(id, payload.newPassword, requestedScope ?? user.businessScope ?? BusinessScope.BEILUN);
  }

  @Post(':id/force-logout')
  @Audit('users', 'force-logout')
  forceLogout(
    @Param('id') id: string,
    @Query('businessScope') requestedScope: BusinessScope | undefined,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.forceLogout(id, requestedScope ?? user.businessScope ?? BusinessScope.BEILUN);
  }

  @Post(':id/roles')
  @Audit('users', 'bind-role')
  bindRoles(
    @Param('id') id: string,
    @Body() payload: BindRolesDto,
    @Query('businessScope') requestedScope: BusinessScope | undefined,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.bindRoles(id, payload.roles, requestedScope ?? user.businessScope ?? BusinessScope.BEILUN);
  }

  @Delete(':id/roles/:roleId')
  @Audit('users', 'unbind-role')
  unbindRole(
    @Param('id') id: string,
    @Param('roleId') roleId: string,
    @Query('businessScope') requestedScope: BusinessScope | undefined,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.unbindRole(id, roleId, requestedScope ?? user.businessScope ?? BusinessScope.BEILUN);
  }
}
