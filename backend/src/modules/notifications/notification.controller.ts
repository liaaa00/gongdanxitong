import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { NotificationService } from './notification.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  list(@Query() query: QueryNotificationsDto, @CurrentUser() user: JwtUserPayload) {
    return this.notificationService.list(user.sub, query);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: JwtUserPayload) {
    return { count: await this.notificationService.countUnread(user.sub) };
  }

  @Get('unread-by-type')
  unreadByType(@CurrentUser() user: JwtUserPayload) {
    return this.notificationService.countUnreadByType(user.sub);
  }

  @Get(':id')
  detail(@Param('id') id: string, @CurrentUser() user: JwtUserPayload) {
    return this.notificationService.get(id, user.sub);
  }

  // P7 CHANGELOG: mark-read endpoints return HTTP 200 + JSON body for frontend unread-count refresh.
  @Post(':id/read')
  @HttpCode(200)
  markRead(@Param('id') id: string, @CurrentUser() user: JwtUserPayload) {
    return this.notificationService.markRead(id, user.sub);
  }

  @Post('read-all')
  @HttpCode(200)
  markAllRead(@CurrentUser() user: JwtUserPayload) {
    return this.notificationService.markAllRead(user.sub);
  }

  @Patch('read-all')
  patchAllRead(@CurrentUser() user: JwtUserPayload) {
    return this.notificationService.markAllRead(user.sub);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUserPayload) {
    return this.notificationService.remove(id, user.sub);
  }
}
