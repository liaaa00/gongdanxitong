import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { AppConfig } from 'src/config/configuration';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { TEMPLATE_VARIABLES } from './portal-notification.config';
import { PortalNotificationSettingsService } from './portal-notification-settings.service';
import { CalendarYearQueryDto, PortalNotificationPreviewDto, PortalNotificationQueueQueryDto, PortalSchedulePreviewDto, SavePortalCalendarDto, SavePortalNotificationSettingsDto } from './portal-notifications.dto';
import { PortalNotificationsService } from './portal-notifications.service';

const CONFIG_ROLES = ['admin', 'biz_manager', 'business_owner', 'manager', 'biz_leader', 'business_group_leader', 'biz_member', 'business_group_member', 'salesperson'];

@Roles(...CONFIG_ROLES)
@Controller('customer-portal-notifications')
export class PortalNotificationsController {
  constructor(private readonly notifications: PortalNotificationsService, private readonly settings: PortalNotificationSettingsService, private readonly config: ConfigService<AppConfig, true>) {}
  @Get('settings')
  async getSettings() {
    const { settings } = await this.settings.get();
    const transport = this.config.get<AppConfig['mail']>('mail', { infer: true });
    return { settings, templateVariables: TEMPLATE_VARIABLES, reminderOffsets: [3, 2, 1], timezone: 'Asia/Shanghai', transportEnabled: Boolean(transport?.enabled), transportConfigured: Boolean(transport?.host && transport?.from && transport.port > 0) };
  }
  @Put('settings') @Roles('admin')
  saveSettings(@Body() body: SavePortalNotificationSettingsDto, @CurrentUser() user: JwtUserPayload) { return this.settings.saveSettings({ ...body }, user.sub); }
  @Get('calendar')
  calendar(@Query() query: CalendarYearQueryDto) { return this.notifications.calendarYear(query.year); }
  @Put('calendar') @Roles('admin')
  saveCalendar(@Body() body: SavePortalCalendarDto, @CurrentUser() user: JwtUserPayload) { return this.settings.saveCalendar(body.days, user.sub); }
  @Delete('calendar/:date') @Roles('admin')
  resetCalendar(@Param('date') date: string, @CurrentUser() user: JwtUserPayload) { return this.settings.removeCalendar(date, user.sub); }
  @Get('queue')
  queue(@Query() query: PortalNotificationQueueQueryDto) { return this.notifications.listQueue(query); }
  @Post('queue/:id/retry')
  retry(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtUserPayload) { return this.notifications.retry(id, user.sub); }
  @Post('preview')
  preview(@Body() body: PortalNotificationPreviewDto) {
    if (Object.entries(body.variables).some(([key, value]) => !(TEMPLATE_VARIABLES as readonly string[]).includes(key) || typeof value !== 'string' || value.length > 1000)) throw new BadRequestException('预览变量无效，密码和令牌不能进入邮件');
    return this.settings.render(body.kind, body.variables);
  }
  @Get('schedule-preview')
  previewSchedule(@Query() query: PortalSchedulePreviewDto) { return this.notifications.previewSchedule(query.date, query.billingDay, query.payrollMonthMode); }
}
