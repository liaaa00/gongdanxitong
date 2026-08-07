import {
  Body,
  Controller,
  Delete,
  Get,
  Query,
  Param,
  Post,
  Put,
  UseInterceptors,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import { Audit } from 'src/common/decorators/audit.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { BusinessScope } from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
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

  @IsOptional()
  @IsEnum(BusinessScope)
  businessScope?: BusinessScope;
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

  @IsOptional()
  @IsEnum(BusinessScope)
  businessScope?: BusinessScope;
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

  // 创建入职/在职/省外工单需要读取发起部门；部门管理写操作仍仅限管理员。
  @Get()
  @Roles('admin', 'biz_manager', 'business_owner', 'biz_leader', 'business_group_leader', 'biz_member', 'business_group_member', 'salesperson')
  tree(@Query('businessScope') requestedScope: BusinessScope | undefined, @CurrentUser() user: JwtUserPayload) {
    return this.service.getTree(requestedScope ?? user.businessScope ?? BusinessScope.BEILUN);
  }

  @Post()
  @Audit('departments', 'create')
  create(@Body() payload: SaveDepartmentDto, @Query('businessScope') requestedScope: BusinessScope | undefined, @CurrentUser() user: JwtUserPayload) {
    return this.service.create({ ...payload, businessScope: payload.businessScope ?? requestedScope ?? user.businessScope ?? BusinessScope.BEILUN });
  }

  @Put(':id')
  @Audit('departments', 'update')
  update(@Param('id') id: string, @Body() payload: UpdateDepartmentDto, @Query('businessScope') requestedScope: BusinessScope | undefined, @CurrentUser() user: JwtUserPayload) {
    return this.service.update(id, { ...payload, businessScope: payload.businessScope ?? requestedScope ?? user.businessScope ?? BusinessScope.BEILUN });
  }

  @Delete(':id')
  @Audit('departments', 'delete')
  remove(@Param('id') id: string, @Query('businessScope') requestedScope: BusinessScope | undefined, @CurrentUser() user: JwtUserPayload) {
    return this.service.remove(id, requestedScope ?? user.businessScope ?? BusinessScope.BEILUN);
  }

  @Post(':id/move')
  @Audit('departments', 'move')
  move(@Param('id') id: string, @Body() payload: MoveDepartmentDto, @Query('businessScope') requestedScope: BusinessScope | undefined, @CurrentUser() user: JwtUserPayload) {
    return this.service.move(id, { ...payload, businessScope: requestedScope ?? user.businessScope ?? BusinessScope.BEILUN });
  }
}
