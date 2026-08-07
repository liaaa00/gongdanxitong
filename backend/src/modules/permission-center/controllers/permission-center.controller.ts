import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { PermissionCenterService } from '../services/permission-center.service';
import { PermissionCacheService } from '../services/permission-cache.service';
import { PermissionNotificationGateway } from '../gateways/permission-notification.gateway';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { PermissionConfig } from '../types/permission-config.types';
import { BusinessScope } from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';

@Controller('permission-center')
@UseGuards(JwtAuthGuard)
export class PermissionCenterController {
  constructor(
    private service: PermissionCenterService,
    private cacheService: PermissionCacheService,
    private notificationGateway: PermissionNotificationGateway,
  ) {}

  @Get('config')
  async getActiveConfig(@Request() req: { user: JwtUserPayload }, @Query('businessScope') requestedScope?: BusinessScope) {
    return this.service.getActiveConfig(this.resolveScope(req.user, requestedScope));
  }

  @Get('versions')
  @Roles('admin')
  async getAllVersions(@Request() req: { user: JwtUserPayload }, @Query('businessScope') requestedScope?: BusinessScope) {
    return this.service.getAllVersions(this.resolveScope(req.user, requestedScope));
  }

  @Get('versions/:id')
  @Roles('admin')
  async getVersionById(@Param('id') id: string, @Request() req: { user: JwtUserPayload }, @Query('businessScope') requestedScope?: BusinessScope) {
    return this.service.getVersionById(id, this.resolveScope(req.user, requestedScope));
  }

  @Post('config')
  @Roles('admin')
  async createVersion(
    @Body() createDto: { config: PermissionConfig; description?: string },
    @Request() req: any,
  ) {
    const businessScope = this.resolveScope(req.user, req.query?.businessScope as BusinessScope | undefined);
    return this.service.createVersion(
      createDto.config,
      req.user.id,
      createDto.description,
      businessScope,
    );
  }

  @Post('config/:versionId/activate')
  @Roles('admin')
  async activateVersion(@Param('versionId') versionId: string, @Request() req: { user: JwtUserPayload; query?: Record<string, unknown> }) {
    const businessScope = this.resolveScope(req.user, req.query?.businessScope as BusinessScope | undefined);
    const version = await this.service.getVersionById(versionId, businessScope);
    await this.service.activateVersion(versionId, businessScope);

    // 清除缓存
    await this.cacheService.clearPermissionCache(businessScope);

    // 通过WebSocket广播配置变更
    await this.notificationGateway.broadcastConfigActivated(
      versionId,
      version.version,
    );

    return { message: 'Version activated successfully' };
  }

  @Get('routes/:roleCode')
  async getRoutePermissions(@Param('roleCode') roleCode: string, @Request() req: { user: JwtUserPayload }, @Query('businessScope') requestedScope?: BusinessScope) {
    return this.service.getRoutePermissionsForRole(roleCode, this.resolveScope(req.user, requestedScope));
  }

  @Get('fields/:scenario/:roleCode')
  async getFieldPermissions(
    @Param('scenario') scenario: string,
    @Param('roleCode') roleCode: string,
    @Request() req: { user: JwtUserPayload },
    @Query('businessScope') requestedScope?: BusinessScope,
  ) {
    return this.service.getFieldPermissionsForRole(scenario, roleCode, this.resolveScope(req.user, requestedScope));
  }

  private resolveScope(user: JwtUserPayload, requestedScope?: BusinessScope): BusinessScope {
    return user.roles?.includes('admin') && requestedScope
      ? requestedScope
      : user.businessScope ?? BusinessScope.BEILUN;
  }
}
