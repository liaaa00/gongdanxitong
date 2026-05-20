import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { Repository } from 'typeorm';
import { Notification } from 'src/entities';
import { NotificationEventBus } from 'src/modules/notifications/notification-event-bus';
import { NotificationService } from 'src/modules/notifications/notification.service';

describe('NotificationEventBus', () => {
  it('pushes notification payloads only to the subscribed user stream', async () => {
    const bus = new NotificationEventBus();
    const received = firstValueFrom(bus.subscribe('user-1').pipe(take(1)));
    bus.subscribe('user-2').pipe(take(1)).subscribe({ next: () => { throw new Error('wrong user received event'); } });

    bus.publish({
      id: 'n1',
      userId: 'user-1',
      bizType: 'dispatched_new',
      title: '新子工单',
      content: '请处理新派发的子工单',
      link: null,
      payload: { dispatchedOrderId: 'do-1' },
      isRead: false,
      createdAt: new Date().toISOString(),
      readAt: null,
    });

    await expect(received).resolves.toMatchObject({ id: 'n1', userId: 'user-1', bizType: 'dispatched_new' });
  });
});

describe('NotificationService read response', () => {
  function makeNotification(overrides: Partial<Notification> = {}): Notification {
    return {
      id: 'n1',
      userId: 'user-1',
      bizType: 'dispatch',
      title: 'title',
      content: 'content',
      link: null,
      payload: null,
      isRead: false,
      createdAt: new Date('2026-05-12T00:00:00.000Z'),
      readAt: null,
      ...overrides,
    } as Notification;
  }

  function makeService(repo: Partial<Repository<Notification>>) {
    return new NotificationService(
      repo as Repository<Notification>,
      null as never,
      null as never,
      null as never,
      null as never,
    );
  }

  it('markRead returns success and unread_count', async () => {
    const row = makeNotification();
    const repo = {
      findOne: jest.fn(async () => row),
      save: jest.fn(async (input: Notification) => input),
      count: jest.fn(async () => 2),
    };
    const service = makeService(repo as unknown as Partial<Repository<Notification>>);

    await expect(service.markRead('n1', 'user-1')).resolves.toEqual({ success: true, unread_count: 2 });
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ isRead: true, readAt: expect.any(Date) }));
    expect(repo.count).toHaveBeenCalledWith({ where: { userId: 'user-1', isRead: false } });
  });

  it('markAllRead returns success and unread_count after updating unread rows', async () => {
    const repo = {
      find: jest.fn(async () => [makeNotification({ id: 'n1' }), makeNotification({ id: 'n2' })]),
      save: jest.fn(async (input: Notification) => input),
      count: jest.fn(async () => 0),
    };
    const service = makeService(repo as unknown as Partial<Repository<Notification>>);

    await expect(service.markAllRead('user-1')).resolves.toEqual({ success: true, unread_count: 0 });
    expect(repo.save).toHaveBeenCalledTimes(2);
  });
});
