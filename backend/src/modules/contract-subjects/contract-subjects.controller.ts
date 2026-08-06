import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ContractSubjectsService } from './contract-subjects.service';

@Controller('contract-subjects')
@UseGuards(JwtAuthGuard)
export class ContractSubjectsController {
  constructor(private readonly service: ContractSubjectsService) {}

  @Get()
  list(@Query('keyword') keyword?: string) {
    return this.service.list(keyword);
  }
}
