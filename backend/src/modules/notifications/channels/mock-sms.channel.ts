import { Injectable, Logger } from '@nestjs/common';
import { Notification } from 'src/entities';
import { NotificationChannelDispatcher, NotificationDispatchContext } from './channel-dispatcher.interface';

@Injectable()
export class MockSmsChannel implements NotificationChannelDispatcher {
  readonly channel = 'sms' as const;
  private readonly logger = new Logger(MockSmsChannel.name);

  async dispatch(context: NotificationDispatchContext): Promise<Notification[]> {
    this.logger.debug(`Mock sms dispatch for ${context.bizType} to ${context.recipients.join(',')}`);
    return [];
  }
}
