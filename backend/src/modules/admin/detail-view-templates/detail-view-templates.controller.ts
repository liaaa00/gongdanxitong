import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseInterceptors } from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { Audit } from 'src/common/decorators/audit.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { BusinessScope } from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { DetailViewTemplatesService } from './detail-view-templates.service';

class QueryDetailViewTemplatesDto {
  @IsOptional()
  @IsString()
  moduleCode?: string;

  @IsOptional()
  @IsIn(['beilun', 'out_of_province'])
  businessScope?: BusinessScope;
}

class SaveDetailViewTemplateDto {
  @IsString()
  templateName!: string;

  @IsString()
  moduleCode!: string;

  @IsOptional()
  @IsIn(['beilun', 'out_of_province'])
  businessScope?: BusinessScope;

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
    return this.service.list(query.moduleCode, query.businessScope);
  }

  @Get('active/:moduleCode')
  @Roles()
  getActiveByModule(@Param('moduleCode') moduleCode: string, @Query('businessScope') businessScope?: BusinessScope) {
    return this.service.getActiveByModule(moduleCode, businessScope);
  }

  @Get(':id')
  @Roles('admin')
  detail(@Param('id') id: string, @Query('businessScope') businessScope?: BusinessScope) {
    return this.service.get(id, businessScope);
  }

  @Post()
  @Roles('admin')
  @Audit('detail_view_templates', 'create')
  create(@Body() payload: SaveDetailViewTemplateDto, @Query('businessScope') requestedScope: BusinessScope | undefined, @CurrentUser() currentUser: JwtUserPayload) {
    return this.service.create({ ...payload, businessScope: payload.businessScope ?? requestedScope ?? currentUser.businessScope ?? BusinessScope.BEILUN, createdBy: currentUser.sub });
  }

  @Put(':id')
  @Roles('admin')
  @Audit('detail_view_templates', 'update')
  update(@Param('id') id: string, @Body() payload: Partial<SaveDetailViewTemplateDto>, @Query('businessScope') requestedScope: BusinessScope | undefined) {
    return this.service.update(id, { ...payload, businessScope: payload.businessScope ?? requestedScope });
  }

  @Delete(':id')
  @Roles('admin')
  @Audit('detail_view_templates', 'delete')
  remove(@Param('id') id: string, @Query('businessScope') businessScope?: BusinessScope) {
    return this.service.remove(id, businessScope);
  }
}
