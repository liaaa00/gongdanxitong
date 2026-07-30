import { Body, Controller, Get, Param, Post, Put, Query, UseInterceptors } from '@nestjs/common';
import { BusinessPermission } from 'src/common/decorators/business-permission.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { assertUuidParam } from 'src/common/utils/uuid-param';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { FieldPermissionScenario } from 'src/modules/field-permissions/field-permission.decorator';
import { SubmitWorkOrderDto } from 'src/modules/work-orders/dto/submit.dto';
import { CreateOutOfProvinceOrderDto } from './dto/create-out-of-province-order.dto';
import { ListOutOfProvinceOrderQueryDto } from './dto/list-out-of-province-order.dto';
import { UpdateOutOfProvinceOrderDto } from './dto/update-out-of-province-order.dto';
import { OutOfProvinceOrdersService } from './out-of-province-orders.service';

@Controller('out-of-province-orders')
@UseInterceptors(AuditInterceptor)
export class OutOfProvinceOrdersController {
  constructor(private readonly service: OutOfProvinceOrdersService) {}

  @Post()
  @BusinessPermission('work_order.create')
  @FieldPermissionScenario('main')
  create(@Body() dto: CreateOutOfProvinceOrderDto, @CurrentUser() user: JwtUserPayload) {
    return this.service.create(dto, user);
  }

  @Get()
  @FieldPermissionScenario('main')
  findAll(@Query() query: ListOutOfProvinceOrderQueryDto, @CurrentUser() user: JwtUserPayload) {
    return this.service.findAll(query, user);
  }

  @Get(':id')
  @FieldPermissionScenario('main')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUserPayload) {
    return this.service.findOne(assertUuidParam(id, 'Out-of-province order not found'), user);
  }

  @Put(':id')
  @FieldPermissionScenario('main')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOutOfProvinceOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.update(assertUuidParam(id, 'Out-of-province order not found'), dto, user);
  }

  @Post(':id/submit')
  @FieldPermissionScenario('main')
  submit(
    @Param('id') id: string,
    @Body() dto: SubmitWorkOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.submit(assertUuidParam(id, 'Out-of-province order not found'), dto, user);
  }

  @Post(':id/resubmit')
  @FieldPermissionScenario('main')
  resubmit(
    @Param('id') id: string,
    @Body() dto: SubmitWorkOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.resubmit(assertUuidParam(id, 'Out-of-province order not found'), dto, user);
  }
}
