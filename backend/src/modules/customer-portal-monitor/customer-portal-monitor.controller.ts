import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtUserPayload } from '../auth/auth.types';
import { CollectPortalMonitorDto, PortalMonitorQueryDto } from './customer-portal-monitor.dto';
import { CustomerPortalMonitorService } from './customer-portal-monitor.service';
import { PortalMonitorConnectorGuard } from './portal-monitor-auth';

@Roles('admin')
@Controller('customer-portal-monitor')
export class CustomerPortalMonitorController {
  constructor(private readonly service: CustomerPortalMonitorService) {}
  @Get('summary') summary(@CurrentUser() user: JwtUserPayload) { return this.service.summary(user); }
  @Get('requests') list(@Query() query: PortalMonitorQueryDto, @CurrentUser() user: JwtUserPayload) { return this.service.list(query, user); }
  @Get('requests/:id') detail(@Param('id') id: string, @CurrentUser() user: JwtUserPayload) { return this.service.detail(id, user); }
}

@Public()
@UseGuards(PortalMonitorConnectorGuard)
@Controller('customer-portal-monitor')
export class PortalMonitorCollectionController {
  constructor(private readonly service: CustomerPortalMonitorService) {}
  @Post('collect') collect(@Body() input: CollectPortalMonitorDto) { return this.service.collect(input); }
}
