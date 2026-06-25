import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseInterceptors,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import { Audit } from 'src/common/decorators/audit.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { DepartmentsService } from './departments.service';

class SaveDepartmentDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,63}$/)
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @Type(() => Number)
  sortOrder?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,63}$/)
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @Type(() => Number)
  sortOrder?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

class MoveDepartmentDto {
  @IsOptional()
  @IsUUID()
  parentId!: string | null;

  @IsOptional()
  @Type(() => Number)
  sortOrder?: number;
}

@Roles('admin')
@Controller('admin/departments')
@UseInterceptors(AuditInterceptor)
export class DepartmentsController {
  constructor(private readonly service: DepartmentsService) {}

  @Get()
  tree() {
    return this.service.getTree();
  }

  @Post()
  @Audit('departments', 'create')
  create(@Body() payload: SaveDepartmentDto) {
    return this.service.create(payload);
  }

  @Put(':id')
  @Audit('departments', 'update')
  update(@Param('id') id: string, @Body() payload: UpdateDepartmentDto) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  @Audit('departments', 'delete')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/move')
  @Audit('departments', 'move')
  move(@Param('id') id: string, @Body() payload: MoveDepartmentDto) {
    return this.service.move(id, payload);
  }
}
