import { Repository } from 'typeorm';
import { DispatchedOrder, DispatchedOrderStatus, ModuleHandler, Notification, WorkOrder, WorkOrderStatus } from 'src/entities';
import { SlaNotificationService } from 'src/modules/dispatched-orders/sla-notification.service';

function repoMock<T extends object>(overrides: Partial<Record<string, unknown>> = {}): Repository<T> {
  return {
    create: jest.fn((input: Partial<T>) => input as T),
    save: jest.fn(async (input: T | T[]) => input),
    find: jest.fn(async () => []),
    ...overrides,
  } as unknown as Repository<T>;
}

function makeParentOrder(): WorkOrder {
  return {
    id: 'wo-1',
    orderNo: 'ON20260526001',
    status: WorkOrderStatus.PROCESSING,
    createdBy: 'creator-1',
  } as WorkOrder;
}

function makeOverdueOrder(overrides: Partial<DispatchedOrder> = {}): DispatchedOrder {
  return {
    id: 'do-1',
    parentOrderId: 'wo-1',
    parentOrder: makeParentOrder(),
    moduleCode: 'data_entry',
    status: DispatchedOrderStatus.PENDING,
    handlerId: null,
    dueAt: new Date('2026-05-25T00:00:00.000Z'),
    dispatchedAt: new Date('2026-05-24T00:00:00.000Z'),
    acceptedAt: null,
    completedAt: null,
    voidAt: null,
    ...overrides,
  } as DispatchedOrder;
}

describe('SlaNotificationService', () => {
  it('creates SLA breach notifications for overdue pending orders even when not accepted', async () => {
    const order = makeOverdueOrder({ handlerId: null, status: DispatchedOrderStatus.PENDING });
    const dispatchedRepo = repoMock<DispatchedOrder>({ find: jest.fn(async () => [order]) });
    const moduleHandlerRepo = repoMock<ModuleHandler>({
      find: jest.fn(async () => [
        { moduleCode: 'data_entry', handlerId: 'handler-1', isActive: true } as ModuleHandler,
        { moduleCode: 'data_entry', handlerId: 'handler-2', isActive: true } as ModuleHandler,
      ]),
    });
    const notificationRepo = repoMock<Notification>({ find: jest.fn(async () => []) });
    const service = new SlaNotificationService(dispatchedRepo, moduleHandlerRepo, notificationRepo);

    await expect(service.createOverdueNotifications(new Date('2026-05-26T00:00:00.000Z'))).resolves.toBe(2);

    expect(dispatchedRepo.find).toHaveBeenCalledWith(expect.objectContaining({
      relations: { parentOrder: true },
      take: 200,
    }));
    expect(moduleHandlerRepo.find).toHaveBeenCalledWith({ where: { moduleCode: 'data_entry', isActive: true } });
    expect(notificationRepo.save).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        userId: 'handler-1',
        bizType: 'sla_breach',
        title: '子工单已超时',
        link: '/my-dispatched/do-1',
        isRead: false,
        payload: expect.objectContaining({
          dispatchedOrderId: 'do-1',
          entityType: 'dispatched_order',
          entityId: 'do-1',
          priority: 'urgent',
          status: DispatchedOrderStatus.PENDING,
        }),
      }),
      expect.objectContaining({ userId: 'handler-2', bizType: 'sla_breach' }),
    ]));
  });

  it('does not create duplicate unread SLA breach notifications for the same user and dispatched order', async () => {
    const order = makeOverdueOrder({ handlerId: 'handler-1', status: DispatchedOrderStatus.PROCESSING });
    const dispatchedRepo = repoMock<DispatchedOrder>({ find: jest.fn(async () => [order]) });
    const moduleHandlerRepo = repoMock<ModuleHandler>({
      find: jest.fn(async () => [{ moduleCode: 'data_entry', handlerId: 'handler-1', isActive: true } as ModuleHandler]),
    });
    const notificationRepo = repoMock<Notification>({
      find: jest.fn(async () => [{
        id: 'n-1',
        userId: 'handler-1',
        bizType: 'sla_breach',
        isRead: false,
        payload: { dispatchedOrderId: 'do-1', entityId: 'do-1' },
      } as unknown as Notification]),
    });
    const service = new SlaNotificationService(dispatchedRepo, moduleHandlerRepo, notificationRepo);

    await expect(service.createOverdueNotifications(new Date('2026-05-26T00:00:00.000Z'))).resolves.toBe(0);

    expect(notificationRepo.save).not.toHaveBeenCalled();
  });
});
