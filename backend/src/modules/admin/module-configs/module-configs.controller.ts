import { Body, Controller, Get, Param, Post, Put, Query, UseInterceptors } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Min, ValidateNested } from 'class-validator';
import { Audit } from 'src/common/decorators/audit.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { BusinessScope, DispatchStrategy } from 'src/entities';
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
  @IsIn(['fixed', 'team_claim', 'round_robin', 'load_balance', 'pool'])
  dispatchStrategy?: DispatchStrategy;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  slaHours?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  slaReminderBeforeHours?: number | null;

  @IsOptional()
  @IsIn(['beilun', 'out_of_province'])
  businessScope?: BusinessScope;

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

  @IsOptional()
  @IsIn(['beilun', 'out_of_province'])
  businessScope?: BusinessScope;
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

  @IsOptional()
  @IsIn(['beilun', 'out_of_province'])
  businessScope?: BusinessScope;
}

@Roles('admin')
@Controller('admin')
@UseInterceptors(AuditInterceptor)
export class ModuleConfigsController {
  constructor(private readonly service: ModuleConfigsService) {}

  @Get('work-order-modules')
  listModules(
    @Query('parentModuleCode') parentModuleCode?: string,
    @Query('isActive') isActive?: string,
    @Query('businessScope') businessScope?: BusinessScope,
  ) {
    return this.service.listModules(parentModuleCode, isActive === undefined ? undefined : isActive === 'true', businessScope);
  }

  @Post('work-order-modules')
  @Audit('work_order_modules', 'upsert')
  saveModule(@Body() payload: SaveModuleDto, @Query('businessScope') businessScope?: BusinessScope) {
    return this.service.saveModule({ ...payload, businessScope: payload.businessScope ?? businessScope });
  }

  @Put('work-order-modules/:id')
  @Audit('work_order_modules', 'update')
  updateModule(
    @Param('id') id: string,
    @Body() payload: Partial<SaveModuleDto>,
    @Query('businessScope') businessScope?: BusinessScope,
  ) {
    return this.service.updateModule(id, { ...payload, businessScope: payload.businessScope ?? businessScope });
  }

  @Get('modules/:moduleCode/fields')
  listModuleFields(@Param('moduleCode') moduleCode: string, @Query('businessScope') businessScope?: BusinessScope) {
    return this.service.listModuleFields(moduleCode, businessScope);
  }

  @Put('modules/:moduleCode/fields')
  @Audit('module_fields', 'replace')
  replaceModuleFields(
    @Param('moduleCode') moduleCode: string,
    @Body() payload: ReplaceModuleFieldsDto,
    @Query('businessScope') businessScope?: BusinessScope,
  ) {
    return this.service.replaceModuleFields(moduleCode, payload.fields, businessScope);
  }

  @Get('module-supervisors')
  listSupervisors(@Query('moduleCode') moduleCode?: string, @Query('businessScope') businessScope?: BusinessScope) {
    return this.service.listSupervisors(moduleCode, businessScope);
  }

  @Post('module-supervisors')
  @Audit('module_supervisors', 'upsert')
  saveSupervisor(@Body() payload: SaveSupervisorDto, @Query('businessScope') businessScope?: BusinessScope) {
    return this.service.saveSupervisor({ ...payload, businessScope: payload.businessScope ?? businessScope });
  }

  @Get('action-configs')
  listActions(@Query('moduleCode') moduleCode?: string, @Query('businessScope') businessScope?: BusinessScope) {
    return this.service.listActions(moduleCode, businessScope);
  }

  @Post('action-configs')
  @Audit('action_configs', 'upsert')
  saveAction(@Body() payload: SaveActionDto, @Query('businessScope') businessScope?: BusinessScope) {
    return this.service.saveAction({ ...payload, businessScope: payload.businessScope ?? businessScope });
  }
}
