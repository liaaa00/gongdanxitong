import { Body, Controller, Get, Param, Post, Put, Query, UseInterceptors } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Min, ValidateNested } from 'class-validator';
import { DispatchStrategy } from 'src/entities';
import { Audit } from 'src/common/decorators/audit.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { ModuleConfigsService } from './module-configs.service';

class SaveModuleDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,63}$/)
  moduleCode!: string;

  @IsString()
  moduleName!: string;

  @IsOptional()
  @IsString()
  parentModuleCode?: string | null;

  @IsOptional()
  @IsString()
  moduleType?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsEnum(DispatchStrategy)
  dispatchStrategy?: DispatchStrategy;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  slaHours?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

class ModuleFieldItemDto {
  @IsString()
  fieldCode!: string;

  @IsOptional()
  @IsString()
  groupName?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isRequiredOverride?: boolean | null;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

class ReplaceModuleFieldsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModuleFieldItemDto)
  fields!: ModuleFieldItemDto[];
}

class SaveSupervisorDto {
  @IsString()
  moduleCode!: string;

  @IsUUID()
  supervisorId!: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

class SaveActionDto {
  @IsString()
  moduleCode!: string;

  @IsString()
  actionCode!: string;

  @IsString()
  actionName!: string;

  @IsOptional()
  requiredRoles?: string[] | null;

  @IsOptional()
  formSchema?: Record<string, unknown> | null;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  remarkRequired?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

@Roles('admin')
@Controller('admin')
@UseInterceptors(AuditInterceptor)
export class ModuleConfigsController {
  constructor(private readonly service: ModuleConfigsService) {}

  @Get('work-order-modules')
  listModules(@Query('parentModuleCode') parentModuleCode?: string, @Query('isActive') isActive?: string) {
    return this.service.listModules(parentModuleCode, isActive === undefined ? undefined : isActive === 'true');
  }

  @Post('work-order-modules')
  @Audit('work_order_modules', 'upsert')
  saveModule(@Body() payload: SaveModuleDto) {
    return this.service.saveModule(payload);
  }

  @Put('work-order-modules/:id')
  @Audit('work_order_modules', 'update')
  updateModule(@Param('id') id: string, @Body() payload: Partial<SaveModuleDto>) {
    return this.service.updateModule(id, payload);
  }

  @Get('modules/:moduleCode/fields')
  listModuleFields(@Param('moduleCode') moduleCode: string) {
    return this.service.listModuleFields(moduleCode);
  }

  @Put('modules/:moduleCode/fields')
  @Audit('module_fields', 'replace')
  replaceModuleFields(@Param('moduleCode') moduleCode: string, @Body() payload: ReplaceModuleFieldsDto) {
    return this.service.replaceModuleFields(moduleCode, payload.fields);
  }

  @Get('module-supervisors')
  listSupervisors(@Query('moduleCode') moduleCode?: string) {
    return this.service.listSupervisors(moduleCode);
  }

  @Post('module-supervisors')
  @Audit('module_supervisors', 'upsert')
  saveSupervisor(@Body() payload: SaveSupervisorDto) {
    return this.service.saveSupervisor(payload);
  }

  @Get('action-configs')
  listActions(@Query('moduleCode') moduleCode?: string) {
    return this.service.listActions(moduleCode);
  }

  @Post('action-configs')
  @Audit('action_configs', 'upsert')
  saveAction(@Body() payload: SaveActionDto) {
    return this.service.saveAction(payload);
  }
}
