import { Body, Controller, Get, Param, Post, Put, Query, UseInterceptors } from '@nestjs/common';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Audit } from 'src/common/decorators/audit.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { BatchSaveCustomerPortalRuleInput, CustomerRulesService } from './customer-rules.service';

const CUSTOMER_RULE_ROLES = [
  'admin',
  'biz_manager', 'business_owner', 'manager',
  'biz_leader', 'business_group_leader',
  'biz_member', 'business_group_member', 'salesperson',
] as const;

export class SaveCustomerRuleDto {
  @IsOptional()
  @IsObject()
  onboardingDefaults?: Record<string, unknown>;
  @IsOptional()
  @IsObject()
  resignationDefaults?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  salaryRules?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  sharedEmailRules?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  completionEmailEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  completionEmailTo?: string[];

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  completionEmailCc?: string[];

  @IsOptional()
  @IsEmail()
  completionEmailReplyTo?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  completionEmailBusinessTypes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  completionEmailFields?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  objectionDeadlineDays?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class BatchSaveCustomerRulesDto {
  // Keep row validation in the service so one invalid Excel row cannot reject
  // the entire batch before the successful/failed-row report is assembled.
  @IsArray()
  @ArrayMaxSize(500)
  rows!: BatchSaveCustomerPortalRuleInput[];
}

class ImportRulesFromOrdersDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  customerIds?: string[];
}

@Roles(...CUSTOMER_RULE_ROLES)
@Controller('customer-rules')
@UseInterceptors(AuditInterceptor)
export class CustomerRulesController {
  constructor(private readonly service: CustomerRulesService) {}

  @Get()
  list(@Query() query: PaginationQueryDto, @CurrentUser() user: JwtUserPayload) {
    return this.service.list(query, user);
  }

  @Get(':customerId')
  detail(@Param('customerId') customerId: string, @CurrentUser() user: JwtUserPayload) {
    return this.service.get(customerId, user);
  }

  @Get(':customerId/portal-defaults')
  portalDefaults(@Param('customerId') customerId: string, @CurrentUser() user: JwtUserPayload) {
    return this.service.getPortalDefaults(customerId, user);
  }

  @Post('batch')
  @Audit('customer_portal_rules', 'batch_update')
  batchUpdate(@Body() payload: BatchSaveCustomerRulesDto, @CurrentUser() user: JwtUserPayload) {
    return this.service.batchUpsert(payload.rows, user);
  }

  @Post('import-from-orders')
  @Audit('customer_portal_rules', 'import_from_orders')
  importFromOrders(@Body() payload: ImportRulesFromOrdersDto, @CurrentUser() user: JwtUserPayload) {
    return this.service.importFromExistingOrders(payload.customerIds, user);
  }

  @Put(':customerId')
  @Audit('customer_portal_rules', 'update')
  update(
    @Param('customerId') customerId: string,
    @Body() payload: SaveCustomerRuleDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.upsert(customerId, payload, user);
  }
}
