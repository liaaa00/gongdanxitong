import { Body, Controller, Get, Post, Put, UseInterceptors } from '@nestjs/common';
import { Audit } from 'src/common/decorators/audit.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { AiSettingsService } from './ai-settings.service';
import { TestAiSettingsDto, UpdateAiSettingsDto } from './dto/update-ai-settings.dto';

@Roles('admin')
@Controller('admin/ai-settings')
@UseInterceptors(AuditInterceptor)
export class AiSettingsController {
  constructor(private readonly service: AiSettingsService) {}

  @Get()
  get() {
    return this.service.getConfigPublic();
  }

  @Put()
  @Audit('ai-settings', 'update')
  update(@Body() payload: UpdateAiSettingsDto) {
    return this.service.updateConfig(payload);
  }

  @Post('test')
  test(@Body() payload: TestAiSettingsDto) {
    return this.service.testConnection(payload);
  }
}
