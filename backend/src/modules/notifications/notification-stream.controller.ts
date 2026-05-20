import { Controller, MessageEvent, Sse } from '@nestjs/common';
import { interval, map, merge, Observable } from 'rxjs';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { NotificationEventBus } from './notification-event-bus';

@Controller()
export class NotificationStreamController {
  constructor(private readonly eventBus: NotificationEventBus) {}

  @Sse('events/notifications')
  streamByEvents(@CurrentUser() user: JwtUserPayload): Observable<MessageEvent> {
    return this.buildStream(user.sub);
  }

  @Sse('notifications/stream')
  streamByNotifications(@CurrentUser() user: JwtUserPayload): Observable<MessageEvent> {
    return this.buildStream(user.sub);
  }

  private buildStream(userId: string): Observable<MessageEvent> {
    const heartbeat$ = interval(1000).pipe(map(() => ({ type: 'ping', data: { ts: Date.now() } }) as MessageEvent));
    const notifications$ = this.eventBus.subscribe(userId).pipe(
      map((payload) => ({ type: 'notification', data: payload }) as MessageEvent),
    );
    return merge(heartbeat$, notifications$);
  }
}
