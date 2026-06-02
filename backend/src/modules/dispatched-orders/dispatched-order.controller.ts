import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseInterceptors } from '@nestjs/common';
import { ApiResponse } from 'src/common/decorators/api-response.decorator';
import { Audit } from 'src/common/decorators/audit.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { AuditInterceptor } from 'src/common/interceptors/audit.interceptor';
import { assertUuidParam } from 'src/common/utils/uuid-param';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { FieldPermissionScenario } from 'src/modules/field-permissions/field-permission.decorator';
import { DispatchedOrderService } from './dispatched-order.service';
import { AcceptDispatchedOrderDto } from './dto/accept.dto';
import { BatchCompleteDispatchedOrderDto } from './dto/batch-complete.dto';
import { BatchDeleteDispatchedOrderDto } from './dto/batch-delete.dto';
import { BatchExportDispatchedOrderDto } from './dto/batch-export.dto';
import { BatchImportDispatchedOrdersDto } from './dto/batch-import.dto';
import { BatchReturnDispatchedOrderDto } from './dto/batch-return.dto';
import { BenefitTransitionDto } from './dto/benefit-transition.dto';
import { CompleteDispatchedOrderDto } from './dto/complete.dto';
import { ExportDispatchedOrderDto } from './dto/export.dto';
import { ListDispatchedOrderQueryDto } from './dto/list-query.dto';
import { ReassignDispatchedOrderDto } from './dto/reassign.dto';
import { ReturnDispatchedOrderDto } from './dto/return.dto';
import { SupplementFieldDto } from './dto/supplement.dto';

@Controller('dispatched-orders')
@UseInterceptors(AuditInterceptor)
export class DispatchedOrderController {
  constructor(private readonly dispatchedOrderService: DispatchedOrderService) {}

  @Get()
  @FieldPermissionScenario('dispatched:auto')
  findAll(@Query() query: ListDispatchedOrderQueryDto, @CurrentUser() user: JwtUserPayload) {
    return this.dispatchedOrderService.findAll(query, user);
  }

  @Get('team/:module')
  @FieldPermissionScenario((request) => `dispatched:${request.params.module}`)
  findTeam(
    @Param('module') moduleCode: string,
    @Query() query: ListDispatchedOrderQueryDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.dispatchedOrderService.findTeam(moduleCode, query, user);
  }

  @Get('module-members')
  @FieldPermissionScenario('dispatched:auto')
  listModuleMembers(@Query('moduleCode') moduleCode: string, @CurrentUser() user: JwtUserPayload) {
    return this.dispatchedOrderService.listModuleMembers(moduleCode, user);
  }

  @Post('batch-delete')
  @HttpCode(200)
  @Roles('admin')
  @Audit('dispatched_orders', 'batch-delete')
  batchDelete(@Body() payload: BatchDeleteDispatchedOrderDto, @CurrentUser() user: JwtUserPayload) {
    return this.dispatchedOrderService.batchRemove(payload.ids, user);
  }

  @Get(':id/supplement-logs')
  @ApiResponse({ status: 404, description: '子工单不存在' })
  @ApiResponse({ status: 403, description: '无权访问该子工单补充日志' })
  @FieldPermissionScenario('dispatched:auto')
  getSupplementLogs(@Param('id') id: string, @CurrentUser() user: JwtUserPayload) {
    return this.dispatchedOrderService.getSupplementLogs(assertUuidParam(id, '子工单不存在'), user);
  }

  @Get(':id')
  @ApiResponse({ status: 404, description: '子工单不存在' })
  @ApiResponse({ status: 403, description: '无权访问该子工单' })
  @FieldPermissionScenario('dispatched:auto')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUserPayload) {
    return this.dispatchedOrderService.findOne(assertUuidParam(id, '子工单不存在'), user);
  }

  @Delete(':id')
  @Roles('admin')
  @Audit('dispatched_orders', 'delete')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUserPayload) {
    return this.dispatchedOrderService.remove(assertUuidParam(id, '瀛愬伐鍗曚笉瀛樺湪'), user);
  }

  @Post('batch-complete')
  @FieldPermissionScenario('dispatched:auto')
  batchComplete(
    @Body() payload: BatchCompleteDispatchedOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.dispatchedOrderService.batchComplete(payload, user);
  }

  @Post('batch-return')
  @FieldPermissionScenario('dispatched:auto')
  batchReturn(
    @Body() payload: BatchReturnDispatchedOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.dispatchedOrderService.batchReturn(payload, user);
  }

  @Post('batch-urge')
  @FieldPermissionScenario('dispatched:auto')
  batchUrge(
    @Body() payload: { ids?: string[]; reason?: string },
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.dispatchedOrderService.batchUrge(payload, user);
  }

  @Post('batch-import')
  @FieldPermissionScenario('dispatched:auto')
  batchImport(
    @Body() payload: BatchImportDispatchedOrdersDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.dispatchedOrderService.batchImport(payload, user);
  }

  @Post('batch-export')
  @FieldPermissionScenario('dispatched:auto')
  batchExport(
    @Body() payload: BatchExportDispatchedOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.dispatchedOrderService.batchExport(payload, user);
  }

  @Post('social-insurance/batch-complete')
  @FieldPermissionScenario('dispatched:social_insurance')
  batchCompleteSocialInsurance(
    @Body() payload: BatchCompleteDispatchedOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.dispatchedOrderService.batchCompleteSocialInsurance(payload, user);
  }

  @Post(':id/accept')
  @FieldPermissionScenario('dispatched:auto')
  accept(
    @Param('id') id: string,
    @Body() payload: AcceptDispatchedOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.dispatchedOrderService.accept(assertUuidParam(id, '子工单不存在'), payload, user);
  }

  @Post(':id/claim')
  @FieldPermissionScenario('dispatched:auto')
  claim(@Param('id') id: string, @CurrentUser() user: JwtUserPayload) {
    return this.dispatchedOrderService.claim(assertUuidParam(id, '子工单不存在'), user);
  }

  @Post(':id/dirty/confirm-read')
  @FieldPermissionScenario('dispatched:auto')
  confirmDirtyRead(@Param('id') id: string, @CurrentUser() user: JwtUserPayload) {
    return this.dispatchedOrderService.confirmDirtyRead(assertUuidParam(id, '子工单不存在'), user);
  }

  @Post(':id/complete')
  @FieldPermissionScenario('dispatched:auto')
  complete(
    @Param('id') id: string,
    @Body() payload: CompleteDispatchedOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.dispatchedOrderService.complete(assertUuidParam(id, '子工单不存在'), payload, user);
  }

  @Post(':id/return')
  @FieldPermissionScenario('dispatched:auto')
  returnOrder(
    @Param('id') id: string,
    @Body() payload: ReturnDispatchedOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.dispatchedOrderService.returnOrder(assertUuidParam(id, '子工单不存在'), payload, user);
  }

  @Post(':id/creator-update')
  @FieldPermissionScenario('dispatched:auto')
  creatorUpdateFields(
    @Param('id') id: string,
    @Body() payload: { fields?: Record<string, unknown>; reason?: string; workOrderUpdatedAt?: string },
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.dispatchedOrderService.creatorUpdateFields(assertUuidParam(id, '子工单不存在'), payload, user);
  }

  @Post(':id/urge')
  @FieldPermissionScenario('dispatched:auto')
  urge(
    @Param('id') id: string,
    @Body() payload: { reason?: string },
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.dispatchedOrderService.urge(assertUuidParam(id, '子工单不存在'), payload, user);
  }

  @Post(':id/withdraw')
  @FieldPermissionScenario('dispatched:auto')
  withdraw(
    @Param('id') id: string,
    @Body() payload: { reason?: string },
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.dispatchedOrderService.withdraw(id, payload, user);
  }

  @Post(':id/withdraw/approve')
  @FieldPermissionScenario('dispatched:auto')
  approveWithdraw(
    @Param('id') id: string,
    @Body() payload: { approved?: boolean; comment?: string },
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.dispatchedOrderService.approveWithdraw(assertUuidParam(id, '子工单不存在'), payload, user);
  }

  @Post(':id/void')
  @FieldPermissionScenario('dispatched:auto')
  voidByCreator(
    @Param('id') id: string,
    @Body() payload: { reason?: string },
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.dispatchedOrderService.voidByCreator(id, payload, user);
  }

  @Post(':id/void/approve')
  @FieldPermissionScenario('dispatched:auto')
  approveVoid(
    @Param('id') id: string,
    @Body() payload: { approved?: boolean; comment?: string },
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.dispatchedOrderService.approveVoid(assertUuidParam(id, '子工单不存在'), payload, user);
  }

  @Post(':id/void/restore')
  @FieldPermissionScenario('dispatched:auto')
  restoreVoidByCreator(
    @Param('id') id: string,
    @Body() payload: { moduleCode?: string; module_code?: string },
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.dispatchedOrderService.restoreVoidByCreator(assertUuidParam(id, '子工单不存在'), payload, user);
  }

  // 0602 E-1/E-2/E-3：子工单级“重新提交”。发起人在【已退回/已撤回/已作废】子单详情页重提，
  // 合并撤销作废语义；重提后子单重新流转到对应后道（pending），父工单回到处理中。
  @Post(':id/resubmit')
  @FieldPermissionScenario('dispatched:auto')
  resubmitDispatched(
    @Param('id') id: string,
    @Body() payload: { extraData?: Record<string, unknown>; reason?: string; moduleCode?: string; module_code?: string; workOrderUpdatedAt?: string },
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.dispatchedOrderService.resubmitDispatched(assertUuidParam(id, '子工单不存在'), payload, user);
  }

  @Post(':id/supplement')
  supplement(
    @Param('id') id: string,
    @Body() payload: SupplementFieldDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.dispatchedOrderService.supplement(assertUuidParam(id, '子工单不存在'), payload, user);
  }

  @Post(':id/reassign')
  @FieldPermissionScenario('dispatched:auto')
  reassign(
    @Param('id') id: string,
    @Body() payload: ReassignDispatchedOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.dispatchedOrderService.reassign(assertUuidParam(id, '子工单不存在'), payload, user);
  }

  @Post(':id/benefit/transition')
  @FieldPermissionScenario('dispatched:auto')
  transitionBenefitStage(
    @Param('id') id: string,
    @Body() payload: BenefitTransitionDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.dispatchedOrderService.transitionBenefitStage(assertUuidParam(id, '子工单不存在'), payload, user);
  }

  @Post(':id/export')
  exportOrder(
    @Param('id') id: string,
    @Body() payload: ExportDispatchedOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.dispatchedOrderService.exportOrder(assertUuidParam(id, '子工单不存在'), payload, user);
  }
}

@Controller('work-orders/sub')
export class WorkOrderSubOrderController {
  constructor(private readonly dispatchedOrderService: DispatchedOrderService) {}

  @Post(':id/reassign')
  @FieldPermissionScenario('dispatched:auto')
  reassign(
    @Param('id') id: string,
    @Body() payload: ReassignDispatchedOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.dispatchedOrderService.reassign(assertUuidParam(id, '子工单不存在'), payload, user);
  }
}
