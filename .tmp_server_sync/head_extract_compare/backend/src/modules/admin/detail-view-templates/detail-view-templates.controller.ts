import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseInterceptors } from '@nestjs/common';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { Audit } from 'src/common/decorators/audit.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { DetailViewTemplatesService } from './detail-view-templates.service';

class QueryDetailViewTemplatesDto {
  @IsOptional()
  @IsString()
  moduleCode?: string;
}

class SaveDetailViewTemplateDto {
  @IsString()
  templateName!: string;

  @IsString()
  moduleCode!: string;

  @IsArray()
  fieldList!: Array<Record<string, unknown>>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@Roles('admin')
@Controller('admin/detail-view-templates')
@UseInterceptors(AuditInterceptor)
export class DetailViewTemplatesController {
  constructor(private readonly service: DetailViewTemplatesService) {}

  @Get()
  @Roles('admin')
  list(@Query() query: QueryDetailViewTemplatesDto) {
    return this.service.list(query.moduleCode);
  }

  @Get('active/:moduleCode')
  @Roles()
  getActiveByModule(@Param('moduleCode') moduleCode: string) {
    return this.service.getActiveByModule(moduleCode);
  }

  @Get(':id')
  @Roles('admin')
  detail(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  @Roles('admin')
  @Audit('detail_view_templates', 'create')
  create(@Body() payload: SaveDetailViewTemplateDto, @CurrentUser() currentUser: JwtUserPayload) {
    return this.service.create({ ...payload, createdBy: currentUser.sub });
  }

  @Put(':id')
  @Roles('admin')
  @Audit('detail_view_templates', 'update')
  update(@Param('id') id: string, @Body() payload: Partial<SaveDetailViewTemplateDto>) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  @Roles('admin')
  @Audit('detail_view_templates', 'delete')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
