import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseInterceptors } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { Audit } from 'src/common/decorators/audit.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { BusinessScope } from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { BranchesService } from './branches.service';

class QueryBranchesDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  customer_id?: string;

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

class SaveBranchDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  customer_id?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  branchCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  branch_code?: string;

  @IsOptional()
  @IsString()
  branchName?: string;

  @IsOptional()
  @IsString()
  branch_name?: string;

  @IsOptional()
  @IsString()
  city?: string;

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

@Roles('admin')
@Controller('admin/branches')
@UseInterceptors(AuditInterceptor)
export class BranchesController {
  constructor(private readonly service: BranchesService) {}

  @Get()
  list(@Query() query: QueryBranchesDto, @CurrentUser() user: JwtUserPayload) {
    const businessScope = query.businessScope ?? query.business_scope ?? user.businessScope ?? BusinessScope.BEILUN;
    return this.service.list({ ...query, businessScope, business_scope: businessScope });
  }

  @Post()
  @Audit('branches', 'create')
  create(@Body() payload: SaveBranchDto, @Query('businessScope') requestedScope: BusinessScope | undefined, @CurrentUser() user: JwtUserPayload) {
    const businessScope = payload.businessScope ?? payload.business_scope ?? requestedScope ?? user.businessScope ?? BusinessScope.BEILUN;
    return this.service.create({ ...payload, businessScope, business_scope: businessScope });
  }

  @Get(':id')
  detail(@Param('id') id: string, @Query('businessScope') requestedScope: BusinessScope | undefined, @CurrentUser() user: JwtUserPayload) {
    return this.service.get(id, requestedScope ?? user.businessScope ?? BusinessScope.BEILUN);
  }

  @Put(':id')
  @Audit('branches', 'update')
  update(@Param('id') id: string, @Body() payload: SaveBranchDto, @Query('businessScope') requestedScope: BusinessScope | undefined, @CurrentUser() user: JwtUserPayload) {
    const businessScope = payload.businessScope ?? payload.business_scope ?? requestedScope ?? user.businessScope ?? BusinessScope.BEILUN;
    return this.service.update(id, { ...payload, businessScope, business_scope: businessScope });
  }

  @Delete(':id')
  @Audit('branches', 'delete')
  remove(@Param('id') id: string, @Query('businessScope') requestedScope: BusinessScope | undefined, @CurrentUser() user: JwtUserPayload) {
    return this.service.remove(id, requestedScope ?? user.businessScope ?? BusinessScope.BEILUN);
  }
}
