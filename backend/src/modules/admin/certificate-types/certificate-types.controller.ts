import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { BusinessScope } from 'src/entities';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CertificateTypesService } from './certificate-types.service';
import { CreateCertificateTypeDto, UpdateCertificateTypeDto } from './dto';

@Controller('admin/certificate-types')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CertificateTypesController {
  constructor(private readonly certificateTypesService: CertificateTypesService) {}

  @Get()
  @Roles('admin')
  findAll(@Query('businessScope') businessScope?: BusinessScope) {
    return this.certificateTypesService.findAll(businessScope);
  }

  @Get(':id')
  @Roles('admin')
  findOne(@Param('id') id: string, @Query('businessScope') businessScope?: BusinessScope) {
    return this.certificateTypesService.findOne(id, businessScope);
  }

  @Post()
  @Roles('admin')
  create(@Body() createDto: CreateCertificateTypeDto, @Query('businessScope') businessScope?: BusinessScope) {
    return this.certificateTypesService.create({ ...createDto, businessScope: createDto.businessScope ?? businessScope });
  }

  @Put(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() updateDto: UpdateCertificateTypeDto, @Query('businessScope') businessScope?: BusinessScope) {
    return this.certificateTypesService.update(id, { ...updateDto, businessScope: updateDto.businessScope ?? businessScope });
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string, @Query('businessScope') businessScope?: BusinessScope) {
    return this.certificateTypesService.remove(id, businessScope);
  }
}
