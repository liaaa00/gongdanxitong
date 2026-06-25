import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseInterceptors } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { Audit } from 'src/common/decorators/audit.decorator';
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
}

@Roles('admin')
@Controller('admin/customer-assignees')
@UseInterceptors(AuditInterceptor)
export class CustomerAssigneesController {
  constructor(private readonly service: CustomerAssigneesService) {}

  @Get()
  list(@Query() query: QueryCustomerAssigneesDto) {
    return this.service.list(query);
  }

  @Post()
  @Audit('customer_assignees', 'create')
  create(@Body() payload: SaveCustomerAssigneeDto) {
    return this.service.create(payload);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Put(':id')
  @Audit('customer_assignees', 'update')
  update(@Param('id') id: string, @Body() payload: SaveCustomerAssigneeDto) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  @Audit('customer_assignees', 'delete')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
