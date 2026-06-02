import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { Repository } from 'typeorm';
import { DispatchedOrder, FieldPermissionMode, FieldSupplementLog, FieldSupplementRule, Notification, User, WorkOrder } from 'src/entities';
import { NotificationEventBus } from 'src/modules/notifications/notification-event-bus';
import { NotificationService } from 'src/modules/notifications/notification.service';
import { FieldChangeHook } from 'src/modules/notifications/field-change.hook';
import { FieldSupplementService } from 'src/modules/field-supplement/field-supplement.service';
import { FieldPermissionService } from 'src/modules/field-permissions/field-permission.service';

describe('NotificationEventBus', () => {
  it('pushes notification payloads only to the subscribed user stream', async () => {
    const bus = new NotificationEventBus();
    const received = firstValueFrom(bus.subscribe('user-1').pipe(take(1)));
    bus.subscribe('user-2').pipe(take(1)).subscribe({ next: () => { throw new Error('wrong user received event'); } });

    bus.publish({
      id: 'n1',
      userId: 'user-1',
      bizType: 'dispatched_new',
      title: 'new dispatched order',
      content: 'please handle it',
      link: null,
      payload: { dispatchedOrderId: 'do-1' },
      isRead: false,
      createdAt: new Date().toISOString(),
      readAt: null,
    });

    await expect(received).resolves.toMatchObject({ id: 'n1', userId: 'user-1', bizType: 'dispatched_new' });
  });
});

function repoMock<T extends object>(overrides: Partial<Record<string, unknown>> = {}): Repository<T> {
  return {
    create: jest.fn((input: Partial<T>) => input as T),
    save: jest.fn(async (input: T) => input),
    findOne: jest.fn(async () => null),
    find: jest.fn(async () => []),
    count: jest.fn(async () => 0),
    remove: jest.fn(async () => undefined),
    manager: {
      query: jest.fn(async () => []),
    },
    ...overrides,
  } as unknown as Repository<T>;
}

describe('NotificationService read response and filters', () => {
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

  function makeService(repo: Partial<Repository<Notification>>, userRepo: Partial<Repository<User>> = {}) {
    return new NotificationService(
      repo as Repository<Notification>,
      userRepo as Repository<User>,
      null as never,
      null as never,
      null as never,
      null as never,
    );
  }

  function getWhere(mock: jest.Mock): unknown {
    const firstCall = mock.mock.calls[0] as Array<{ where?: unknown }> | undefined;
    return firstCall?.[0]?.where;
  }

  function expectDispatchExcluded(where: unknown) {
    expect(where).toEqual(expect.objectContaining({ userId: 'user-1' }));
    expect((where as { bizType?: { _type?: string } }).bizType).toEqual(expect.objectContaining({ _type: 'not' }));
  }

  it('markRead returns success and unread_count using non-dispatch unread scope', async () => {
    const row = makeNotification();
    const repo = {
      findOne: jest.fn(async () => row),
      save: jest.fn(async (input: Notification) => input),
      count: jest.fn(async () => 2),
    };
    const service = makeService(repo as unknown as Partial<Repository<Notification>>);

    await expect(service.markRead('n1', 'user-1')).resolves.toEqual({ success: true, unread_count: 2 });
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ isRead: true, readAt: expect.any(Date) }));
    expect(repo.count).toHaveBeenCalledWith({ where: expect.objectContaining({ userId: 'user-1', isRead: false }) });
    expectDispatchExcluded(getWhere(repo.count));
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
    expectDispatchExcluded(getWhere(repo.count));
  });

  it('list excludes dispatch notifications by default and reuses the shared where scope', async () => {
    const repo = {
      find: jest.fn(async () => []),
    };
    const service = makeService(repo as unknown as Partial<Repository<Notification>>);

    await service.list('user-1', { unread: true, page: 1, pageSize: 20 });

    expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'user-1', isRead: false }) }));
    expectDispatchExcluded(getWhere(repo.find));
  });

  it('list includes dispatch notifications only when includeDispatch=true', async () => {
    const repo = {
      find: jest.fn(async () => []),
    };
    const service = makeService(repo as unknown as Partial<Repository<Notification>>);

    await service.list('user-1', { includeDispatch: true, page: 1, pageSize: 20 });

    const where = getWhere(repo.find) as { userId?: string; bizType?: unknown };
    expect(where).toEqual(expect.objectContaining({ userId: 'user-1' }));
    expect(where.bizType).toBeDefined();
  });

  it('normalizes legacy field-change actor placeholders in list response', async () => {
    const row = makeNotification({
      bizType: 'order.field_changed',
      content: '办理人 修改了 data_entry_feedback',
      payload: { actorUserId: 'actor-1' },
    });
    const repo = repoMock<Notification>({
      find: jest.fn(async () => [row]),
      manager: { query: jest.fn(async () => [{ field_code: 'data_entry_feedback', field_name: '数据录入反馈' }]) },
    });
    const userRepo = {
      find: jest.fn(async () => [{ id: 'actor-1', realName: '张三', username: 'zhangsan' } as User]),
    };
    const service = makeService(repo as unknown as Partial<Repository<Notification>>, userRepo as unknown as Partial<Repository<User>>);

    const result = await service.list('user-1', { includeDispatch: true, page: 1, pageSize: 20 });

    expect(result.items[0].content).toBe('张三 修改了 数据录入反馈');
    expect(result.items[0].content).not.toContain('办理人');
    expect(result.items[0].content).not.toContain('data_entry_feedback');
    expect(result.items[0]).toEqual(expect.objectContaining({
      actorUserId: 'actor-1',
      actor_user_id: 'actor-1',
      actorName: '张三',
      actor_name: '张三',
      operatorName: '张三',
      operator_name: '张三',
    }));
  });

  it('converts legacy payload.diff to diff_fields/diff_summary and readable Chinese content', async () => {
    const row = makeNotification({
      bizType: 'order.field_changed',
      content: '杨纯 修改了 contract_feedback',
      payload: {
        workOrderId: 'wo-1',
        orderNo: 'ON-001',
        actorUserId: 'actor-1',
        diff: [{ field: 'contract_feedback', before: '未签', after: '已签' }],
      },
    });
    const repo = repoMock<Notification>({
      find: jest.fn(async () => [row]),
      manager: { query: jest.fn(async () => [{ field_code: 'contract_feedback', field_name: '劳动合同签订反馈' }]) },
    });
    const userRepo = {
      find: jest.fn(async () => [{ id: 'actor-1', realName: '杨纯', username: 'yangchun' } as User]),
    };
    const service = makeService(repo as unknown as Partial<Repository<Notification>>, userRepo as unknown as Partial<Repository<User>>);

    const result = await service.list('user-1', { includeDispatch: true, page: 1, pageSize: 20 });
    const item = result.items[0];

    expect(item.content).toBe('杨纯 修改了【工单字段】：【劳动合同签订反馈】由【未签】改为【已签】');
    expect(item.content).not.toContain('contract_feedback');
    expect(item.diff_summary).toBe('【劳动合同签订反馈】由【未签】改为【已签】');
    expect(item.diffSummary).toBe(item.diff_summary);
    expect(item.diff_fields).toEqual([
      expect.objectContaining({
        field_code: 'contract_feedback',
        field_name: '劳动合同签订反馈',
        old_value: '未签',
        new_value: '已签',
        fieldCode: 'contract_feedback',
        fieldName: '劳动合同签订反馈',
        oldValue: '未签',
        newValue: '已签',
        oldText: '未签',
        newText: '已签',
      }),
    ]);
    expect(item.diffFields).toEqual(item.diff_fields);
    expect((item.payload as Record<string, unknown>).diff_summary).toBe('【劳动合同签订反馈】由【未签】改为【已签】');
    expect((item.payload as Record<string, unknown>).diff_fields).toEqual(item.diff_fields);
  });

  it('converts legacy payload.diff object to readable Chinese diff details', async () => {
    const row = makeNotification({
      bizType: 'order.field_changed',
      content: '杨纯 修改了 contract_feedback',
      payload: {
        workOrderId: 'wo-1',
        orderNo: 'ON-001',
        actorName: '杨纯',
        diff: { field: 'contract_feedback', before: '待确认', after: '已签回' },
      },
    });
    const repo = repoMock<Notification>({
      find: jest.fn(async () => [row]),
      manager: { query: jest.fn(async () => [{ field_code: 'contract_feedback', field_name: '劳动合同签订反馈' }]) },
    });
    const service = makeService(repo as unknown as Partial<Repository<Notification>>);

    const result = await service.list('user-1', { includeDispatch: true, page: 1, pageSize: 20 });
    const item = result.items[0];

    expect(item.content).toBe('杨纯 修改了【工单字段】：【劳动合同签订反馈】由【待确认】改为【已签回】');
    expect(item.content).not.toContain('contract_feedback');
    expect(item.diff_summary).toBe('【劳动合同签订反馈】由【待确认】改为【已签回】');
    expect(item.diff_fields).toEqual([
      expect.objectContaining({
        field_code: 'contract_feedback',
        field_name: '劳动合同签订反馈',
        old_value: '待确认',
        new_value: '已签回',
      }),
    ]);
    expect((item.payload as Record<string, unknown>).diff_fields).toEqual(item.diff_fields);
    expect((item.payload as Record<string, unknown>).diff_summary).toBe(item.diff_summary);
  });

  it('falls back to a generic Chinese label instead of exposing unknown internal field code', async () => {
    const row = makeNotification({
      bizType: 'order.field_changed',
      content: '杨纯 修改了 unknown_internal_field',
      payload: {
        actorName: '杨纯',
        diff: [{ field: 'unknown_internal_field', before: '旧值', after: '新值' }],
      },
    });
    const repo = repoMock<Notification>({
      find: jest.fn(async () => [row]),
      manager: { query: jest.fn(async () => []) },
    });
    const service = makeService(repo as unknown as Partial<Repository<Notification>>);

    const result = await service.list('user-1', { includeDispatch: true, page: 1, pageSize: 20 });

    expect(result.items[0].content).toBe('杨纯 修改了【工单字段】：【业务字段】由【旧值】改为【新值】');
    expect(result.items[0].content).not.toContain('unknown_internal_field');
    expect(result.items[0].diff_fields?.[0]).toEqual(expect.objectContaining({
      field_code: 'unknown_internal_field',
      field_name: '业务字段',
    }));
  });

  it('countUnread is always unread and excludes dispatch by default', async () => {
    const repo = {
      count: jest.fn(async () => 3),
    };
    const service = makeService(repo as unknown as Partial<Repository<Notification>>);

    await expect(service.countUnread('user-1', { unread: false })).resolves.toBe(3);

    expect(repo.count).toHaveBeenCalledWith({ where: expect.objectContaining({ userId: 'user-1', isRead: false }) });
    expectDispatchExcluded(getWhere(repo.count));
  });

  it('countUnreadByBucket returns salesperson and backend unread bucket counts', async () => {
    const repo = {
      find: jest.fn(async () => [
        makeNotification({ bizType: 'order.field_changed' }),
        makeNotification({ bizType: 'dispatched_completed' }),
        makeNotification({ bizType: 'dispatched_accepted' }),
        makeNotification({ bizType: 'dispatched_returned_to_salesperson' }),
        makeNotification({ bizType: 'withdraw_approved' }),
        makeNotification({ bizType: 'urge_received' }),
        makeNotification({ bizType: 'sla_warning' }),
        makeNotification({ bizType: 'sla_breach' }),
        makeNotification({ bizType: 'withdraw_request' }),
        makeNotification({ bizType: 'void_request' }),
        makeNotification({ bizType: 'system_announcement' }),
      ]),
    };
    const service = makeService(repo as unknown as Partial<Repository<Notification>>);

    await expect(service.countUnreadByBucket('user-1')).resolves.toEqual({
      total: 11,
      salesperson: { field_changed: 2, returned: 1, withdraw_void_result: 1, system: 1 },
      backend: { todo: 3, urge: 0, sla_warning: 0, sla_breached: 0, creator_modified: 1, withdraw_void_request: 2, system: 1 },
      system: 1,
    });
    expect(repo.find).toHaveBeenCalledWith({
      where: expect.objectContaining({ userId: 'user-1', isRead: false }),
      select: { bizType: true },
    });
    expectDispatchExcluded(getWhere(repo.find));
  });
});

describe('Field-change notification generation', () => {
  it('creates readable field-change notifications with diffFields and diffSummary', async () => {
    const workOrderRepo = repoMock<WorkOrder>({
      findOne: jest.fn(async () => ({
        id: 'wo-1',
        orderNo: 'ON-001',
        createdBy: 'creator-1',
      } as WorkOrder)),
    });
    const dispatchedRepo = repoMock<DispatchedOrder>({
      find: jest.fn(async () => [{ handlerId: 'handler-1' }] as DispatchedOrder[]),
    });
    const userRepo = repoMock<User>({
      findOne: jest.fn(async () => ({ id: 'actor-1', realName: '杨纯', username: 'yangchun' } as User)),
    });
    const notificationService = {
      bulkCreate: jest.fn(async (inputs: unknown[]) => inputs),
    } as unknown as NotificationService;
    const hook = new FieldChangeHook(workOrderRepo, dispatchedRepo, userRepo, notificationService);

    await hook.onWorkOrderUpdated({
      orderId: 'wo-1',
      actorUserId: 'actor-1',
      diff: [{ field: 'contract_feedback', before: '未签', after: '已签' }],
    });

    expect(notificationService.bulkCreate).toHaveBeenCalledTimes(1);
    const [inputs] = (notificationService.bulkCreate as jest.Mock).mock.calls[0] as [Array<Record<string, unknown>>];
    expect(inputs).toHaveLength(2);
    expect(inputs[0].content).toBe('杨纯 修改了【工单字段】：【劳动合同签订反馈】由【未签】改为【已签】');
    expect(inputs[0].content as string).not.toContain('contract_feedback');
    expect(inputs[0].payload).toEqual(expect.objectContaining({
      diff: [{ field: 'contract_feedback', before: '未签', after: '已签' }],
      diffSummary: '【劳动合同签订反馈】由【未签】改为【已签】',
      diffFields: [expect.objectContaining({
        field_code: 'contract_feedback',
        field_name: '劳动合同签订反馈',
        old_value: '未签',
        new_value: '已签',
      })],
    }));
  });

  it('creates readable direct field-supplement notification with diff details', async () => {
    const version = new Date('2026-05-11T00:00:00.000Z');
    const workOrder = {
      id: 'wo-1',
      orderNo: 'ON-001',
      status: 'processing',
      createdBy: 'creator-1',
      departmentId: 'd1',
      customerId: 'c1',
      employeeName: '张三',
      employeeIdCard: '330102199001010011',
      extraData: { contract_feedback: '未签' },
      submittedAt: new Date(),
      completedAt: null,
      createdAt: new Date(),
      updatedAt: version,
    } as unknown as WorkOrder;
    const ruleRepo = repoMock<FieldSupplementRule>({
      findOne: jest.fn(async () => ({ id: 'rule-1', syncToModules: [], fieldCode: 'contract_feedback', supplementerModule: 'contract', isActive: true } as FieldSupplementRule)),
    });
    const logRepo = repoMock<FieldSupplementLog>({ save: jest.fn(async (input: FieldSupplementLog) => input) });
    const workOrderRepo = repoMock<WorkOrder>({ save: jest.fn(async (input: WorkOrder) => input) });
    const dispatchedRepo = repoMock<DispatchedOrder>({
      findOne: jest.fn(async () => ({ id: 'do-1', moduleCode: 'contract', parentOrder: workOrder } as DispatchedOrder)),
      find: jest.fn(async () => []),
    });
    const notificationRepo = repoMock<Notification>({
      create: jest.fn((input: Partial<Notification>) => input as Notification),
      save: jest.fn(async (input: Notification) => input),
    });
    const fieldPermissionService = {
      getPermissionsForUser: jest.fn(async () => new Map([['contract_feedback', FieldPermissionMode.VISIBLE]])),
    } as unknown as FieldPermissionService;
    const fieldChangeHook = { onSupplementFilled: jest.fn(async () => undefined) } as unknown as FieldChangeHook;
    const service = new FieldSupplementService(ruleRepo, logRepo, workOrderRepo, dispatchedRepo, notificationRepo, fieldPermissionService, fieldChangeHook);

    await service.supplement({
      dispatchedOrderId: 'do-1',
      fieldCode: 'contract_feedback',
      newValue: '已签',
      userId: 'actor-1',
      workOrderUpdatedAt: version.toISOString(),
    });

    expect(notificationRepo.save).toHaveBeenCalled();
    const saved = (notificationRepo.save as jest.Mock).mock.calls[0][0] as Notification;
    expect(saved.content).toBe('操作人 补充了【工单字段】：【劳动合同签订反馈】由【未签】改为【已签】');
    expect(saved.content).not.toContain('contract_feedback');
    expect(saved.payload).toEqual(expect.objectContaining({
      fieldCode: 'contract_feedback',
      fieldName: '劳动合同签订反馈',
      oldValue: '未签',
      newValue: '已签',
      diffSummary: '【劳动合同签订反馈】由【未签】改为【已签】',
      diffFields: [expect.objectContaining({
        field_code: 'contract_feedback',
        field_name: '劳动合同签订反馈',
        old_value: '未签',
        new_value: '已签',
      })],
    }));
  });
});

