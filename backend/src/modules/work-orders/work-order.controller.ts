import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UseInterceptors } from '@nestjs/common';
import { ApiResponse } from 'src/common/decorators/api-response.decorator';
import { BusinessPermission } from 'src/common/decorators/business-permission.decorator';
import { Audit } from 'src/common/decorators/audit.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { assertUuidParam } from 'src/common/utils/uuid-param';
import { JwtUserPayload } from 'src/modules/auth/auth.types';

import { FieldPermissionScenario } from 'src/modules/field-permissions/field-permission.decorator';
import { BatchDeleteWorkOrderDto } from './dto/batch-delete.dto';
import { CreateWorkOrderDto } from './dto/create.dto';
import { ListWorkOrderQueryDto } from './dto/list-query.dto';
import { SubmitWorkOrderDto } from './dto/submit.dto';
import { UpdateWorkOrderDto } from './dto/update.dto';
import { UrgeWorkOrderDto } from './dto/urge.dto';
import { VoidApproveWorkOrderDto } from './dto/void-approve.dto';
import { VoidWorkOrderDto } from './dto/void.dto';
import { WithdrawApproveWorkOrderDto } from './dto/withdraw-approve.dto';
import { WithdrawWorkOrderDto } from './dto/withdraw.dto';
import { WorkOrderService } from './work-order.service';

@Controller('work-orders')
@UseInterceptors(AuditInterceptor)
export class WorkOrderController {
  constructor(private readonly workOrderService: WorkOrderService) {}

  @Get()
  @FieldPermissionScenario('main')
  findAll(@Query() query: ListWorkOrderQueryDto, @CurrentUser() user: JwtUserPayload) {
    return this.workOrderService.findAll(query, user);
  }

  @Post()
  @BusinessPermission('work_order.create')
  @FieldPermissionScenario('main')
  create(@Body() payload: CreateWorkOrderDto, @CurrentUser() user: JwtUserPayload) {
    return this.workOrderService.createDraft(payload, user);
  }

  @Post('batch-delete')
  @HttpCode(200)
  @Roles('admin')
  @Audit('work_orders', 'batch-delete')
  batchDelete(@Body() payload: BatchDeleteWorkOrderDto, @CurrentUser() user: JwtUserPayload) {
    return this.workOrderService.batchRemove(payload.ids, user);
  }

  @Get(':id/timeline')
  @ApiResponse({ status: 404, description: '工单不存在' })
  @ApiResponse({ status: 403, description: '无权访问该工单动态' })
  @FieldPermissionScenario('main')
  timeline(@Param('id') id: string, @CurrentUser() user: JwtUserPayload) {
    return this.workOrderService.timeline(assertUuidParam(id, '工单不存在'), user);
  }

  @Get(':id')
  @ApiResponse({ status: 404, description: '工单不存在' })
  @ApiResponse({ status: 403, description: '无权访问该工单' })
  @FieldPermissionScenario('main')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUserPayload) {
    return this.workOrderService.findOne(assertUuidParam(id, '工单不存在'), user);
  }

  @Delete(':id')
  @Roles('admin')
  @Audit('work_orders', 'delete')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUserPayload) {
    return this.workOrderService.remove(assertUuidParam(id, 'work order not found'), user);
  }

  @Put(':id')
  @FieldPermissionScenario('main')
  update(
    @Param('id') id: string,
    @Body() payload: UpdateWorkOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.workOrderService.update(assertUuidParam(id, '工单不存在'), payload, user);
  }

  @Post(':id/submit')
  @FieldPermissionScenario('main')
  submit(
    @Param('id') id: string,
    @Body() payload: SubmitWorkOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.workOrderService.submit(assertUuidParam(id, '工单不存在'), payload, user);
  }

  @Post(':id/resubmit')
  @FieldPermissionScenario('main')
  resubmit(
    @Param('id') id: string,
    @Body() payload: SubmitWorkOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.workOrderService.resubmit(assertUuidParam(id, '工单不存在'), payload, user);
  }

  @Post(':id/withdraw')
  @FieldPermissionScenario('main')
  withdraw(
    @Param('id') id: string,
    @Body() payload: WithdrawWorkOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.workOrderService.withdraw(assertUuidParam(id, '工单不存在'), payload, user);
  }

  @Post(':id/withdraw/approve')
  @FieldPermissionScenario('main')
  approveWithdraw(
    @Param('id') id: string,
    @Body() payload: WithdrawApproveWorkOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.workOrderService.approveWithdraw(assertUuidParam(id, '工单不存在'), payload, user);
  }

  @Post(':id/urge')
  @FieldPermissionScenario('main')
  urge(
    @Param('id') id: string,
    @Body() payload: UrgeWorkOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.workOrderService.urge(assertUuidParam(id, '工单不存在'), payload, user);
  }

  @Post(':id/void')
  @FieldPermissionScenario('main')
  voidWorkOrder(
    @Param('id') id: string,
    @Body() payload: VoidWorkOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.workOrderService.void(assertUuidParam(id, '工单不存在'), payload, user);
  }

  @Post(':id/void/approve')
  @FieldPermissionScenario('main')
  approveVoid(
    @Param('id') id: string,
    @Body() payload: VoidApproveWorkOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.workOrderService.approveVoid(assertUuidParam(id, '工单不存在'), payload, user);
  }
}
