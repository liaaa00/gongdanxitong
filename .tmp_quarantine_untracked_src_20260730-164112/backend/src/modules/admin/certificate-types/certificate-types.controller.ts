import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CertificateTypesService } from './certificate-types.service';
import { CreateCertificateTypeDto, UpdateCertificateTypeDto } from './certificate-types.dto';

@Controller('admin/certificate-types')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class CertificateTypesController {
  constructor(private readonly certificateTypesService: CertificateTypesService) {}

  @Get()
  async findAll() {
    return this.certificateTypesService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.certificateTypesService.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateCertificateTypeDto) {
    return this.certificateTypesService.create(dto);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateCertificateTypeDto) {
    return this.certificateTypesService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.certificateTypesService.remove(id);
    return { success: true };
  }
}
