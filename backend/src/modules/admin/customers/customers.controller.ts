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
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { Audit } from 'src/common/decorators/audit.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { BusinessScope } from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { Roles } from 'src/common/decorators/roles.decorator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { CustomersService } from './customers.service';

class QueryCustomersDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  onlyUsedInOrders?: boolean;

  @IsOptional()
  @IsEnum(BusinessScope)
  businessScope?: BusinessScope;
}

class SaveCustomerDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  customerCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  customer_code?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customer_name?: string;

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

class ToggleCustomerDto {
  @Type(() => Boolean)
  @IsBoolean()
  isActive!: boolean;
}

@Roles('admin')
@Controller('admin/customers')
@UseInterceptors(AuditInterceptor)
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  // 创建入职/在职/省外工单需要读取客户选项；客户管理写操作仍仅限管理员。
  @Get()
  @Roles('admin', 'biz_manager', 'business_owner', 'biz_leader', 'business_group_leader', 'biz_member', 'business_group_member', 'salesperson')
  list(@Query() query: QueryCustomersDto, @CurrentUser() user: JwtUserPayload) {
    return this.service.list({ ...query, businessScope: query.businessScope ?? user.businessScope ?? BusinessScope.BEILUN });
  }

  @Post()
  @Audit('customers', 'create')
  create(@Body() payload: SaveCustomerDto, @Query('businessScope') requestedScope: BusinessScope | undefined, @CurrentUser() user: JwtUserPayload) {
    return this.service.create({ ...payload, businessScope: payload.businessScope ?? requestedScope ?? user.businessScope ?? BusinessScope.BEILUN });
  }

  @Get(':id')
  detail(@Param('id') id: string, @Query('businessScope') businessScope: BusinessScope | undefined, @CurrentUser() user: JwtUserPayload) {
    return this.service.get(id, businessScope ?? user.businessScope ?? BusinessScope.BEILUN);
  }

  @Put(':id')
  @Audit('customers', 'update')
  update(@Param('id') id: string, @Body() payload: Partial<SaveCustomerDto>, @Query('businessScope') requestedScope: BusinessScope | undefined, @CurrentUser() user: JwtUserPayload) {
    return this.service.update(id, { ...payload, businessScope: payload.businessScope ?? requestedScope ?? user.businessScope ?? BusinessScope.BEILUN });
  }

  @Delete(':id')
  @Audit('customers', 'delete')
  remove(@Param('id') id: string, @Query('businessScope') requestedScope: BusinessScope | undefined, @CurrentUser() user: JwtUserPayload) {
    return this.service.remove(id, requestedScope ?? user.businessScope ?? BusinessScope.BEILUN);
  }

  @Post(':id/toggle')
  @Audit('customers', 'toggle')
  toggle(@Param('id') id: string, @Body() payload: ToggleCustomerDto, @Query('businessScope') requestedScope: BusinessScope | undefined, @CurrentUser() user: JwtUserPayload) {
    return this.service.toggle(id, payload.isActive, requestedScope ?? user.businessScope ?? BusinessScope.BEILUN);
  }
}
