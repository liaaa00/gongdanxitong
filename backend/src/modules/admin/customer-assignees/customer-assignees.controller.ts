import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseInterceptors } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { Audit } from 'src/common/decorators/audit.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { BusinessScope } from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { Roles } from 'src/common/decorators/roles.decorator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { CustomerAssigneesService } from './customer-assignees.service';

class QueryCustomerAssigneesDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  customer_id?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  user_id?: string;

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
}

class SaveCustomerAssigneeDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  customer_id?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  user_id?: string;

  @IsOptional()
  @IsString()
  groupCode?: string;

  @IsOptional()
  @IsString()
  group_code?: string;

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
}

@Roles('admin')
@Controller('admin/customer-assignees')
@UseInterceptors(AuditInterceptor)
export class CustomerAssigneesController {
  constructor(private readonly service: CustomerAssigneesService) {}

  @Get()
  list(@Query() query: QueryCustomerAssigneesDto, @CurrentUser() user: JwtUserPayload) {
    return this.service.list({ ...query, businessScope: query.businessScope ?? user.businessScope ?? BusinessScope.BEILUN });
  }

  @Post()
  @Audit('customer_assignees', 'create')
  create(@Body() payload: SaveCustomerAssigneeDto, @Query('businessScope') requestedScope: BusinessScope | undefined, @CurrentUser() user: JwtUserPayload) {
    return this.service.create({ ...payload, businessScope: payload.businessScope ?? requestedScope ?? user.businessScope ?? BusinessScope.BEILUN });
  }

  @Get(':id')
  detail(@Param('id') id: string, @Query('businessScope') businessScope: BusinessScope | undefined, @CurrentUser() user: JwtUserPayload) {
    return this.service.get(id, businessScope ?? user.businessScope ?? BusinessScope.BEILUN);
  }

  @Put(':id')
  @Audit('customer_assignees', 'update')
  update(@Param('id') id: string, @Body() payload: SaveCustomerAssigneeDto, @Query('businessScope') requestedScope: BusinessScope | undefined, @CurrentUser() user: JwtUserPayload) {
    return this.service.update(id, { ...payload, businessScope: payload.businessScope ?? requestedScope ?? user.businessScope ?? BusinessScope.BEILUN });
  }

  @Delete(':id')
  @Audit('customer_assignees', 'delete')
  remove(@Param('id') id: string, @Query('businessScope') requestedScope: BusinessScope | undefined, @CurrentUser() user: JwtUserPayload) {
    return this.service.remove(id, requestedScope ?? user.businessScope ?? BusinessScope.BEILUN);
  }
}
