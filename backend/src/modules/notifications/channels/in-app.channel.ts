import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from 'src/entities';
import { NotificationEventBus, NotificationStreamPayload } from '../notification-event-bus';
import { NotificationChannelDispatcher, NotificationDispatchContext } from './channel-dispatcher.interface';

@Injectable()
export class InAppNotificationChannel implements NotificationChannelDispatcher {
  readonly channel = 'in_app' as const;

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    private readonly eventBus: NotificationEventBus,
  ) {}

  async dispatch(context: NotificationDispatchContext): Promise<Notification[]> {
    const repository = context.manager?.getRepository(Notification) ?? this.notificationRepository;
    const created: Notification[] = [];

    for (const recipient of context.recipients) {
      const entity = repository.create({
        userId: recipient,
        bizType: context.bizType,
        title: context.title,
        content: context.content,
        link: context.link,
        payload: context.payload,
        isRead: false,
        readAt: null,
      });
      const saved = await repository.save(entity);
      created.push(saved);
      this.eventBus.publish(this.toStreamPayload(saved));
    }

    return created;
  }

  private toStreamPayload(notification: Notification): NotificationStreamPayload {
    return {
      id: notification.id,
      userId: notification.userId,
      bizType: notification.bizType,
      title: notification.title,
      content: notification.content,
      link: notification.link,
      payload: notification.payload ?? null,
      isRead: notification.isRead,
      createdAt: notification.createdAt instanceof Date ? notification.createdAt.toISOString() : new Date(notification.createdAt).toISOString(),
      readAt: notification.readAt ? new Date(notification.readAt).toISOString() : null,
    };
  }
}
