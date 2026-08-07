import { Body, Controller, Get, Put, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { Audit } from 'src/common/decorators/audit.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { BusinessScope } from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { UpdateOperationLogRetentionDto } from './dto/update-operation-log-retention.dto';
import { SystemSettingsService } from './system-settings.service';

@Roles('admin')
@Controller('admin/system-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
export class SystemSettingsController {
  constructor(private readonly service: SystemSettingsService) {}

  @Get('operation-log-retention')
  getOperationLogRetention(@Query('businessScope') requestedScope: BusinessScope | undefined, @CurrentUser() user: JwtUserPayload) {
    return this.service.getOperationLogRetention(requestedScope ?? user.businessScope ?? BusinessScope.BEILUN);
  }

  @Put('operation-log-retention')
  @Audit('system-settings', 'update-operation-log-retention')
  updateOperationLogRetention(@Body() payload: UpdateOperationLogRetentionDto, @Query('businessScope') requestedScope: BusinessScope | undefined, @CurrentUser() user: JwtUserPayload) {
    return this.service.updateOperationLogRetention(payload, requestedScope ?? user.businessScope ?? BusinessScope.BEILUN);
  }
}
