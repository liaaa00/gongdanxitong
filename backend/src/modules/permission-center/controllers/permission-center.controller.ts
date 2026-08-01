import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { PermissionCenterService } from '../services/permission-center.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { PermissionConfig } from '../types/permission-config.types';

@Controller('api/permission-center')
@UseGuards(JwtAuthGuard)
export class PermissionCenterController {
  constructor(private service: PermissionCenterService) {}

  @Get('config')
  @Roles('admin')
  async getActiveConfig() {
    return this.service.getActiveConfig();
  }

  @Get('versions')
  @Roles('admin')
  async getAllVersions() {
    return this.service.getAllVersions();
  }

  @Get('versions/:id')
  @Roles('admin')
  async getVersionById(@Param('id') id: string) {
    return this.service.getVersionById(id);
  }

  @Post('config')
  @Roles('admin')
  async createVersion(
    @Body() createDto: { config: PermissionConfig; description?: string },
    @Request() req,
  ) {
    return this.service.createVersion(
      createDto.config,
      req.user.id,
      createDto.description,
    );
  }

  @Post('config/:versionId/activate')
  @Roles('admin')
  async activateVersion(@Param('versionId') versionId: string) {
    await this.service.activateVersion(versionId);
    return { message: 'Version activated successfully' };
  }

  @Get('routes/:roleCode')
  async getRoutePermissions(@Param('roleCode') roleCode: string) {
    return this.service.getRoutePermissionsForRole(roleCode);
  }

  @Get('fields/:scenario/:roleCode')
  async getFieldPermissions(
    @Param('scenario') scenario: string,
    @Param('roleCode') roleCode: string,
  ) {
    return this.service.getFieldPermissionsForRole(scenario, roleCode);
  }
}
