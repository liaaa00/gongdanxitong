import { Body, Controller, Get, Post, UseInterceptors } from '@nestjs/common';
import { Audit } from 'src/common/decorators/audit.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { IsArray, IsEnum, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { FieldPermissionMode } from 'src/entities';
import { FieldPermissionService } from './field-permission.service';

class BatchPermissionItemDto {
  @IsUUID()
  roleId!: string;

  @IsString()
  scenario!: string;

  @IsString()
  fieldCode!: string;

  @IsEnum(FieldPermissionMode)
  permission!: FieldPermissionMode;
}

class BatchPermissionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchPermissionItemDto)
  items!: BatchPermissionItemDto[];
}

class CopyPermissionDto {
  @IsUUID()
  sourceRoleId!: string;

  @IsArray()
  @IsUUID('4', { each: true })
  targetRoleIds!: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scenarios?: string[];
}

@Controller('admin/field-permissions')
@UseInterceptors(AuditInterceptor)
export class FieldPermissionController {
  constructor(private readonly service: FieldPermissionService) {}

  @Get('matrix')
  getMatrix() {
    return this.service.getMatrix();
  }

  @Roles('admin')
  @Post('batch')
  @Audit('field_permissions', 'batch')
  batch(@Body() payload: BatchPermissionDto) {
    return this.service.batchUpsert(payload.items);
  }

  @Roles('admin')
  @Post('copy')
  @Audit('field_permissions', 'copy')
  copy(@Body() payload: CopyPermissionDto) {
    return this.service.copyToRoles(payload);
  }
}
