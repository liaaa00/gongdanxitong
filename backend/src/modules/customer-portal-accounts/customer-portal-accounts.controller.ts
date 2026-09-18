import { Body, Controller, Get, Param, Post, Put, UseInterceptors } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { Audit } from 'src/common/decorators/audit.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { CustomerPortalAccountsService, PORTAL_BUSINESS_PERMISSIONS, PORTAL_BUSINESS_TYPES, PortalBusinessPermission, PortalBusinessType } from './customer-portal-accounts.service';

const CUSTOMER_CONFIG_ROLES = [
  'admin',
  'biz_manager', 'business_owner', 'manager',
  'biz_leader', 'business_group_leader',
  'biz_member', 'business_group_member', 'salesperson',
] as const;
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/;

class CreatePortalAccountDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @ArrayUnique()
  @IsIn(PORTAL_BUSINESS_PERMISSIONS, { each: true })
  businessPermissions!: PortalBusinessPermission[];

  @IsEmail()
  @MaxLength(320)
  loginEmail!: string;

  @IsString()
  @MaxLength(100)
  contactName!: string;

  @IsString()
  @Matches(PASSWORD_PATTERN, { message: '密码须为 8 至 72 位，并同时包含字母和数字' })
  password!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;
}

class UpdatePortalAccountDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @ArrayUnique()
  @IsIn(PORTAL_BUSINESS_PERMISSIONS, { each: true })
  businessPermissions?: PortalBusinessPermission[];

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  loginEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  contactName?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;
}

class ResetPortalPasswordDto {
  @IsString()
  @Matches(PASSWORD_PATTERN, { message: '密码须为 8 至 72 位，并同时包含字母和数字' })
  password!: string;

  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;
}

class SetPortalAccountSubjectsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  subjects!: string[];

  @IsOptional()
  @IsUUID()
  primarySubjectId?: string;
}

class PortalLoginDto {
  @IsEmail()
  @MaxLength(320)
  loginEmail!: string;

  @IsString()
  @MaxLength(200)
  password!: string;
}

class PortalSessionDto {
  @IsString()
  @MaxLength(4096)
  linkToken!: string;

  @IsOptional()
  @IsIn(PORTAL_BUSINESS_TYPES)
  businessType?: PortalBusinessType;
}

class PortalChangePasswordDto {
  @IsString()
  @MaxLength(4096)
  linkToken!: string;

  @IsString()
  @MaxLength(200)
  oldPassword!: string;

  @IsString()
  @Matches(PASSWORD_PATTERN, { message: '密码须为 8 至 72 位，并同时包含字母和数字' })
  newPassword!: string;
}

@Roles(...CUSTOMER_CONFIG_ROLES)
@Controller('customer-config/customers/:customerId/accounts')
@UseInterceptors(AuditInterceptor)
export class CustomerPortalAccountsController {
  constructor(private readonly service: CustomerPortalAccountsService) {}

  @Get()
  list(@Param('customerId') customerId: string, @CurrentUser() user: JwtUserPayload) {
    return this.service.list(customerId, user);
  }

  @Post()
  @Audit('customer_portal_accounts', 'create')
  create(@Param('customerId') customerId: string, @Body() payload: CreatePortalAccountDto, @CurrentUser() user: JwtUserPayload) {
    return this.service.create(customerId, payload, user);
  }

  @Put(':accountId')
  @Audit('customer_portal_accounts', 'update')
  update(
    @Param('customerId') customerId: string,
    @Param('accountId') accountId: string,
    @Body() payload: UpdatePortalAccountDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.update(customerId, accountId, payload, user);
  }

  @Get(':accountId/subjects')
  listSubjects(
    @Param('customerId') customerId: string,
    @Param('accountId') accountId: string,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.listSubjects(customerId, accountId, user);
  }

  @Put(':accountId/subjects')
  @Audit('customer_portal_accounts', 'set_subjects')
  setSubjects(
    @Param('customerId') customerId: string,
    @Param('accountId') accountId: string,
    @Body() payload: SetPortalAccountSubjectsDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.setSubjects(customerId, accountId, payload, user);
  }

  @Post(':accountId/reset-password')
  @Audit('customer_portal_accounts', 'reset_password')
  resetPassword(
    @Param('customerId') customerId: string,
    @Param('accountId') accountId: string,
    @Body() payload: ResetPortalPasswordDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.resetPassword(customerId, accountId, payload.password, payload.mustChangePassword, user);
  }
}

@Public()
@Controller('portal-auth')
export class PortalAuthController {
  constructor(private readonly service: CustomerPortalAccountsService) {}

  @Post('login')
  login(@Body() payload: PortalLoginDto) {
    return this.service.login(payload.loginEmail, payload.password);
  }

  @Post('session')
  session(@Body() payload: PortalSessionDto) {
    return this.service.session(payload.linkToken, payload.businessType);
  }

  @Post('change-password')
  changePassword(@Body() payload: PortalChangePasswordDto) {
    return this.service.changePassword(payload.linkToken, payload.oldPassword, payload.newPassword);
  }
}
