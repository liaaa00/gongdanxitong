import { Injectable, Logger } from '@nestjs/common';
import { Notification } from 'src/entities';
import { NotificationChannelDispatcher, NotificationDispatchContext } from './channel-dispatcher.interface';

@Injectable()
export class MockEmailChannel implements NotificationChannelDispatcher {
  readonly channel = 'email' as const;
  private readonly logger = new Logger(MockEmailChannel.name);

  async dispatch(context: NotificationDispatchContext): Promise<Notification[]> {
    this.logger.debug(`Mock email dispatch for ${context.bizType} to ${context.recipients.join(',')}`);
    return [];
  }
}
