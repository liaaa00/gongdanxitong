import { Body, Controller, Get, Param, Post, Query, UseInterceptors } from '@nestjs/common';
import { IsArray, IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Audit } from 'src/common/decorators/audit.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { JwtUserPayload } from '../auth/auth.types';
import { CustomerPortalService, PortalInput, PortalFile } from './customer-portal.service';
import { PORTAL_BUSINESS_TYPES, PortalBusinessType } from '../customer-portal-accounts/customer-portal-accounts.service';

class PortalFileDto implements PortalFile {
  @IsString() @MaxLength(180) name!:string;
  @IsString() @MaxLength(160) mimeType!:string;
  @IsOptional() @IsString() @MaxLength(80) bizPurpose?:string;
  @IsString() @MaxLength(28*1024*1024) contentBase64!:string;
}
class PortalInputDto implements PortalInput {
  @IsString() @MaxLength(4096) linkToken!:string;
  @IsOptional() @IsIn(PORTAL_BUSINESS_TYPES) businessType?:PortalBusinessType;
  @IsOptional() @IsString() @MaxLength(100) requestId?:string;
  @IsOptional() @IsUUID() submissionId?:string;
  @IsOptional() @IsObject() fields?:Record<string,unknown>;
  @IsOptional() @IsString() @MaxLength(180) fileName?:string;
  @IsOptional() @IsString() @MaxLength(14*1024*1024) contentBase64?:string;
  @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(()=>PortalFileDto) files?:PortalFileDto[];
}
class CompleteSalaryDto { @IsString() @MaxLength(2000) resultNote!:string; }

/**
 * Customer-facing endpoints authenticate the signed portal link inside the
 * service. They must be reachable without an internal employee JWT.
 */
@Public()
@Controller()
export class CustomerPortalPublicController {
  constructor(private readonly service:CustomerPortalService){}
  @Post('customer-portal/schema') schema(@Body() input:PortalInputDto){return this.service.schema(input);}
  @Post('customer-portal/template') template(@Body() input:PortalInputDto){return this.service.template(input);}
  @Post('customer-portal/submit') submit(@Body() input:PortalInputDto){return this.service.submit(input);}
  @Post('customer-portal/resubmit') resubmit(@Body() input:PortalInputDto){return this.service.resubmit(input);}
  @Post('customer-portal/import/preview') preview(@Body() input:PortalInputDto){return this.service.importRows(input,undefined,false);}
  @Post('customer-portal/import/confirm') confirm(@Body() input:PortalInputDto){return this.service.importRows(input,undefined,true);}
  @Post('customer-portal/progress') progress(@Body() input:PortalInputDto){return this.service.progress(input);}
  @Post('customer-portal/attachments') attachments(@Body() input:PortalInputDto){return this.service.attachments(input);}
}

const CUSTOMER_PORTAL_MANAGEMENT_ROLES = [
  'admin', 'biz_manager', 'business_owner', 'manager', 'biz_leader',
  'business_group_leader', 'biz_member', 'business_group_member', 'salesperson',
] as const;

/** Internal staff endpoints for reviewing customer submissions and mail tasks. */
@Roles(...CUSTOMER_PORTAL_MANAGEMENT_ROLES)
@Controller()
export class CustomerPortalController {
  constructor(private readonly service:CustomerPortalService){}

  @Get('customer-config/salary-workbench') salaryWorkbench(@Query('month') month:string|undefined,@CurrentUser() user:JwtUserPayload){return this.service.listSalaryWorkbench(month,user);}
  @Get('customer-config/salary-returns') salaryReturns(@Query() query:Record<string,string|undefined>,@CurrentUser() user:JwtUserPayload){return this.service.listSalaryReturns(query,user);}
  @Get('customer-config/customers/:customerId/salary') salary(@Param('customerId') id:string,@CurrentUser() user:JwtUserPayload){return this.service.listSalary(id,user);}
  @Post('customer-config/customers/:customerId/salary/:id/complete') @UseInterceptors(AuditInterceptor) @Audit('portal_salary','complete')
  complete(@Param('customerId') customerId:string,@Param('id') id:string,@Body() input:CompleteSalaryDto,@CurrentUser() user:JwtUserPayload){return this.service.completeSalary(id,customerId,input.resultNote,user);}
  @Get('customer-config/customers/:customerId/emails') emails(@Param('customerId') id:string,@CurrentUser() user:JwtUserPayload){return this.service.emailRecords(id,user);}
  @Post('customer-config/customers/:customerId/emails/:id/retry') @UseInterceptors(AuditInterceptor) @Audit('portal_email','retry')
  retry(@Param('customerId') customerId:string,@Param('id') id:string,@CurrentUser() user:JwtUserPayload){return this.service.retryEmail(id,customerId,user);}
}
