import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
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
  findAll() {
    return this.certificateTypesService.findAll();
  }

  @Get(':id')
  @Roles('admin')
  findOne(@Param('id') id: string) {
    return this.certificateTypesService.findOne(id);
  }

  @Post()
  @Roles('admin')
  create(@Body() createDto: CreateCertificateTypeDto) {
    return this.certificateTypesService.create(createDto);
  }

  @Put(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() updateDto: UpdateCertificateTypeDto) {
    return this.certificateTypesService.update(id, updateDto);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.certificateTypesService.remove(id);
  }
}
