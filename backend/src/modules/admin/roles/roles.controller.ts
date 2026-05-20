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
import { Roles } from 'src/common/decorators/roles.decorator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { RoleLevel } from 'src/entities';
import { RolesService } from './roles.service';

class QueryRolesDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

class CreateRoleDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,63}$/)
  code!: string;

  @IsString()
  name!: string;

  @IsEnum(RoleLevel)
  level!: RoleLevel;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,63}$/)
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(RoleLevel)
  level?: RoleLevel;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

@Roles('admin')
@Controller('admin/roles')
@UseInterceptors(AuditInterceptor)
export class RolesController {
  constructor(private readonly service: RolesService) {}

  @Get()
  list(@Query() query: QueryRolesDto) {
    return this.service.list(query);
  }

  @Post()
  @Audit('roles', 'create')
  create(@Body() payload: CreateRoleDto) {
    return this.service.create(payload);
  }

  @Put(':id')
  @Audit('roles', 'update')
  update(@Param('id') id: string, @Body() payload: UpdateRoleDto) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  @Audit('roles', 'delete')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
