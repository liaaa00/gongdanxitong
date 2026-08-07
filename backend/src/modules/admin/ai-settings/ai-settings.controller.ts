import { Body, Controller, Get, Post, Put, Query, UseInterceptors } from '@nestjs/common';
import { Audit } from 'src/common/decorators/audit.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { AiSettingsService } from './ai-settings.service';
import { TestAiSettingsDto, UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { BusinessScope } from 'src/entities';
import { JwtUserPayload } from 'src/modules/auth/auth.types';

@Roles('admin')
@Controller('admin/ai-settings')
@UseInterceptors(AuditInterceptor)
export class AiSettingsController {
  constructor(private readonly service: AiSettingsService) {}

  @Get()
  get(@Query('businessScope') requestedScope: BusinessScope | undefined, @CurrentUser() user: JwtUserPayload) {
    return this.service.getConfigPublic(requestedScope ?? user.businessScope ?? BusinessScope.BEILUN);
  }

  @Put()
  @Audit('ai-settings', 'update')
  update(@Body() payload: UpdateAiSettingsDto, @Query('businessScope') requestedScope: BusinessScope | undefined, @CurrentUser() user: JwtUserPayload) {
    return this.service.updateConfig(payload, requestedScope ?? user.businessScope ?? BusinessScope.BEILUN);
  }

  @Post('test')
  test(@Body() payload: TestAiSettingsDto, @Query('businessScope') requestedScope: BusinessScope | undefined, @CurrentUser() user: JwtUserPayload) {
    return this.service.testConnection(payload, requestedScope ?? user.businessScope ?? BusinessScope.BEILUN);
  }
}
