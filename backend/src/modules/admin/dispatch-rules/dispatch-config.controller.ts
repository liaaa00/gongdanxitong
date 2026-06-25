import { Controller, Get } from '@nestjs/common';
import { Roles } from 'src/common/decorators/roles.decorator';
import { DispatchConfigResponse, DispatchRulesService } from './dispatch-rules.service';

@Roles('admin')
@Controller('admin')
export class DispatchConfigController {
  constructor(private readonly service: DispatchRulesService) {}

  @Get('dispatch-config')
  getDispatchConfig(): Promise<DispatchConfigResponse> {
    return this.service.getDispatchConfig();
  }
}
