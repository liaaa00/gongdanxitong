import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseInterceptors } from '@nestjs/common';
import { IsArray, IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { Audit } from 'src/common/decorators/audit.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { ExportTemplatesService } from './export-templates.service';

class QueryExportTemplatesDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  moduleCode?: string;
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
  detail(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post(':id/apply-preview')
  @Roles('admin')
  applyPreview(@Param('id') id: string, @Body() payload: ApplyExportTemplateDto) {
    return this.service.previewApply(id, payload.dispatchedOrderIds);
  }

  @Post(':id/apply')
  @Roles('admin')
  @Audit('export_templates', 'apply')
  apply(
    @Param('id') id: string,
    @Body() payload: ApplyExportTemplateDto,
    @CurrentUser() currentUser: JwtUserPayload,
  ) {
    return this.service.apply(id, payload.dispatchedOrderIds, currentUser);
  }

  @Post()
  @Roles('admin')
  @Audit('export_templates', 'create')
  create(@Body() payload: SaveExportTemplateDto, @CurrentUser() currentUser: JwtUserPayload) {
    return this.service.create({ ...payload, createdBy: currentUser.sub });
  }

  @Put(':id')
  @Roles('admin')
  @Audit('export_templates', 'update')
  update(@Param('id') id: string, @Body() payload: Partial<SaveExportTemplateDto>) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  @Roles('admin')
  @Audit('export_templates', 'delete')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@Controller('work-order-export-templates')
@Roles('admin', 'biz_member')
export class WorkOrderExportTemplatesController {
  constructor(private readonly service: ExportTemplatesService) {}

  @Get('contract')
  listContractTemplates() {
    return this.service.listSharedContractTemplates();
  }
}
