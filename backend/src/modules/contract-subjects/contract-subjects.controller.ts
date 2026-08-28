import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ContractSubjectsService } from './contract-subjects.service';

@Controller('contract-subjects')
@UseGuards(JwtAuthGuard)
export class ContractSubjectsController {
  constructor(private readonly service: ContractSubjectsService) {}

  @Get('fund-locations')
  fundLocations() {
    return this.service.listFundLocations();
  }

  @Get('fund-rules')
  fundRules(@Query('location') location?: string) {
    return this.service.listFundRules(location);
  }

  @Get()
  list(@Query('keyword') keyword?: string) {
    return this.service.list(keyword);
  }
}
