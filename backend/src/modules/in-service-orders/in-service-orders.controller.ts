import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import {
  ApproveInServiceOrderDto,
  CloseInServiceOrderDto,
  CompleteInServiceOrderDto,
  ReasonInServiceOrderDto,
  StartInServiceProcessingDto,
  TransferInServiceOrderDto,
} from './dto/in-service-order-action.dto';
import { CreateInServiceOrderDto } from './dto/create-in-service-order.dto';
import { ListInServiceOrderQueryDto } from './dto/list-in-service-order.dto';
import { UpdateInServiceOrderDto } from './dto/update-in-service-order.dto';
import {
  RequestMaterialChangeDto,
  ReviewMaterialChangeDto,
} from './dto/material-change.dto';
import { InjuryWarningQueryDto } from './dto/injury-warning-query.dto';
import { InServiceOrdersService } from './in-service-orders.service';

@Controller('in-service-orders')
@UseGuards(JwtAuthGuard)
export class InServiceOrdersController {
  constructor(private readonly service: InServiceOrdersService) {}

  @Post()
  create(@Body() dto: CreateInServiceOrderDto, @CurrentUser() user: JwtUserPayload) {
    return this.service.create(dto, user);
  }

  @Get()
  list(@Query() query: ListInServiceOrderQueryDto, @CurrentUser() user: JwtUserPayload) {
    return this.service.list(query, user);
  }

  @Get('injury-warning')
  injuryWarning(@Query() query: InjuryWarningQueryDto) {
    return this.service.getInjuryWarning(query.idCardNo);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtUserPayload) {
    return this.service.findOne(id, user);
  }

  @Get(':id/certificate-template')
  async certificateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUserPayload,
  ) {
    const result = await this.service.generateCertificate(id, user);
    return new StreamableFile(result.buffer, {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      disposition: `attachment; filename="${result.fileName}"`,
      length: result.buffer.length,
    });
  }

  @Post(':id/renewal-template')
  @HttpCode(HttpStatus.OK)
  renewalTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.exportRenewalTemplate(id, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInServiceOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtUserPayload) {
    return this.service.remove(id, user);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveInServiceOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.approve(id, dto, user);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonInServiceOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.reject(id, dto, user);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  accept(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtUserPayload) {
    return this.service.accept(id, user);
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtUserPayload) {
    return this.service.confirm(id, user);
  }

  @Post(':id/transfer')
  @HttpCode(HttpStatus.OK)
  transfer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferInServiceOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.transfer(id, dto, user);
  }

  @Post(':id/start-processing')
  @HttpCode(HttpStatus.OK)
  startProcessing(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StartInServiceProcessingDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.startProcessing(id, dto, user);
  }

  @Post(':id/request-info')
  @HttpCode(HttpStatus.OK)
  requestInfo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonInServiceOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.requestInfo(id, dto, user);
  }

  @Post(':id/resubmit')
  @HttpCode(HttpStatus.OK)
  resubmit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInServiceOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.resubmit(id, dto, user);
  }

  @Post(':id/material-change-request')
  @HttpCode(HttpStatus.OK)
  requestMaterialChange(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestMaterialChangeDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.requestMaterialChange(id, dto, user);
  }

  @Post(':id/material-change-review')
  @HttpCode(HttpStatus.OK)
  reviewMaterialChange(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewMaterialChangeDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.reviewMaterialChange(id, dto, user);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteInServiceOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.complete(id, dto, user);
  }

  @Post(':id/fail')
  @HttpCode(HttpStatus.OK)
  fail(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteInServiceOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.fail(id, dto, user);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonInServiceOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.cancel(id, dto, user);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseInServiceOrderDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.service.close(id, dto, user);
  }
}
