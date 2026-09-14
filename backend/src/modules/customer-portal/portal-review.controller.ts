import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { MANAGEMENT_SCOPE_ROLES, WORK_ORDER_CREATOR_ROLES } from 'src/common/auth/role-permissions';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { assertUuidParam } from 'src/common/utils/uuid-param';
import { JwtUserPayload } from '../auth/auth.types';
import { PortalReviewService } from './portal-review.service';

@Roles(...WORK_ORDER_CREATOR_ROLES)
@Controller('customer-config/customers/:customerId/intake')
export class PortalReviewController {
  constructor(private readonly service: PortalReviewService) {}
  @Get() list(@Param('customerId') customerId: string, @CurrentUser() user: JwtUserPayload) {
    return this.service.list(assertUuidParam(customerId, '客户不存在'), user);
  }
  @Post(':id/claim') claim(@Param('customerId') customerId: string, @Param('id') id: string, @CurrentUser() user: JwtUserPayload) {
    return this.service.claim(assertUuidParam(customerId, '客户不存在'), assertUuidParam(id, '受理记录不存在'), user);
  }
}


@Roles(...WORK_ORDER_CREATOR_ROLES, ...MANAGEMENT_SCOPE_ROLES)
@Controller("customer-config/intake-review")
export class PortalReviewWorkbenchController {
  constructor(private readonly service: PortalReviewService) {}

  @Get()
  list(@Query() query: { customerId?: string; businessType?: "onboarding" | "resignation"; status?: string; search?: string; page?: string; pageSize?: string }, @CurrentUser() user: JwtUserPayload) {
    return this.service.listWorkbench(user, { ...query, page: query.page ? Number(query.page) : undefined, pageSize: query.pageSize ? Number(query.pageSize) : undefined });
  }

  @Roles(...WORK_ORDER_CREATOR_ROLES)
  @Post(":customerId/:id/return")
  returnForCorrection(@Param("customerId") customerId: string, @Param("id") id: string, @Body() body: { reason?: string; fields?: string[] }, @CurrentUser() user: JwtUserPayload) {
    return this.service.requestCorrection(assertUuidParam(customerId, "客户不存在"), assertUuidParam(id, "受理记录不存在"), { reason: body.reason ?? "", fields: body.fields }, user);
  }
}
