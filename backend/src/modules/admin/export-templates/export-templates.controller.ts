import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseInterceptors } from '@nestjs/common';
import { IsArray, IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { Audit } from 'src/common/decorators/audit.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { BusinessScope } from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { ExportTemplatesService } from './export-templates.service';

class QueryExportTemplatesDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  moduleCode?: string;

  @IsOptional()
  @IsString()
  businessScope?: BusinessScope;
}

class SaveExportTemplateDto {
  @IsString()
  templateName!: string;

  @IsString()
  moduleCode!: string;

  @IsArray()
  fieldList!: Array<Record<string, unknown>>;

  @IsOptional()
  @IsBoolean()
  isShared?: boolean;

  @IsOptional()
  @IsString()
  signPlatform?: string | null;

  @IsOptional()
  @IsString()
  businessScope?: BusinessScope;
}

class ApplyExportTemplateDto {
  @IsArray()
  @IsUUID('4', { each: true })
  dispatchedOrderIds!: string[];
}

@Roles('admin')
@Controller(['admin/export-templates', 'export-templates'])
@UseInterceptors(AuditInterceptor)
export class ExportTemplatesController {
  constructor(private readonly service: ExportTemplatesService) {}

  @Get()
  @Roles('admin')
  list(@Query() query: QueryExportTemplatesDto, @CurrentUser() currentUser: JwtUserPayload) {
    return this.service.list(query, currentUser.sub);
  }

  @Get(':id')
  @Roles('admin')
  detail(@Param('id') id: string, @Query('businessScope') businessScope?: BusinessScope) {
    return this.service.get(id, businessScope);
  }

  @Post(':id/apply-preview')
  @Roles('admin')
  applyPreview(
    @Param('id') id: string,
    @Body() payload: ApplyExportTemplateDto,
    @Query('businessScope') businessScope?: BusinessScope,
  ) {
    return this.service.previewApply(id, payload.dispatchedOrderIds, businessScope);
  }

  @Post(':id/apply')
  @Roles('admin')
  @Audit('export_templates', 'apply')
  apply(
    @Param('id') id: string,
    @Body() payload: ApplyExportTemplateDto,
    @CurrentUser() currentUser: JwtUserPayload,
    @Query('businessScope') businessScope?: BusinessScope,
  ) {
    return this.service.apply(id, payload.dispatchedOrderIds, currentUser, businessScope);
  }

  @Post()
  @Roles('admin')
  @Audit('export_templates', 'create')
  create(@Body() payload: SaveExportTemplateDto, @CurrentUser() currentUser: JwtUserPayload, @Query('businessScope') businessScope?: BusinessScope) {
    return this.service.create({ ...payload, businessScope: payload.businessScope ?? businessScope, createdBy: currentUser.sub });
  }

  @Put(':id')
  @Roles('admin')
  @Audit('export_templates', 'update')
  update(@Param('id') id: string, @Body() payload: Partial<SaveExportTemplateDto>, @Query('businessScope') businessScope?: BusinessScope) {
    return this.service.update(id, { ...payload, businessScope: payload.businessScope ?? businessScope });
  }

  @Delete(':id')
  @Roles('admin')
  @Audit('export_templates', 'delete')
  remove(@Param('id') id: string, @Query('businessScope') businessScope?: BusinessScope) {
    return this.service.remove(id, businessScope);
  }
}

@Controller('work-order-export-templates')
@Roles('admin', 'biz_member')
export class WorkOrderExportTemplatesController {
  constructor(private readonly service: ExportTemplatesService) {}

  @Get('contract')
  listContractTemplates(@Query('businessScope') businessScope?: BusinessScope) {
    return this.service.listSharedContractTemplates(businessScope);
  }
}
