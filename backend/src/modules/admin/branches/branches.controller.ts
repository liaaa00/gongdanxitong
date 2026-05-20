import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseInterceptors } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { Audit } from 'src/common/decorators/audit.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
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
}

@Roles('admin')
@Controller('admin/branches')
@UseInterceptors(AuditInterceptor)
export class BranchesController {
  constructor(private readonly service: BranchesService) {}

  @Get()
  list(@Query() query: QueryBranchesDto) {
    return this.service.list(query);
  }

  @Post()
  @Audit('branches', 'create')
  create(@Body() payload: SaveBranchDto) {
    return this.service.create(payload);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Put(':id')
  @Audit('branches', 'update')
  update(@Param('id') id: string, @Body() payload: SaveBranchDto) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  @Audit('branches', 'delete')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
