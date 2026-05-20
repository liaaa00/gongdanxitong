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
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { Audit } from 'src/common/decorators/audit.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { CustomersService } from './customers.service';

class QueryCustomersDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
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

  @Get()
  list(@Query() query: QueryCustomersDto) {
    return this.service.list(query);
  }

  @Post()
  @Audit('customers', 'create')
  create(@Body() payload: SaveCustomerDto) {
    return this.service.create(payload);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Put(':id')
  @Audit('customers', 'update')
  update(@Param('id') id: string, @Body() payload: Partial<SaveCustomerDto>) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  @Audit('customers', 'delete')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/toggle')
  @Audit('customers', 'toggle')
  toggle(@Param('id') id: string, @Body() payload: ToggleCustomerDto) {
    return this.service.toggle(id, payload.isActive);
  }
}
