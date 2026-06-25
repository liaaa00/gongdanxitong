import * as request from 'supertest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { DispatchRulesController } from 'src/modules/admin/dispatch-rules/dispatch-rules.controller';
import { DispatchRulesService } from 'src/modules/admin/dispatch-rules/dispatch-rules.service';
import { DispatchStrategy, OrderType } from 'src/entities';

describe('DispatchRulesController DTO', () => {
  let app: INestApplication;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('accepts the 6 extended dispatch rule fields and returns them in list', async () => {
    const savedRule = {
      id: 'rule-1',
      ruleName: 'QA extended fields',
      orderType: OrderType.ONBOARDING,
      targetModule: 'contract',
      triggerConditions: null,
      dispatchStrategy: DispatchStrategy.FIXED,
      priority: 10,
      isActive: true,
      subModule: 'contract',
      customerId: 'customer-1',
      departmentId: 'department-1',
      assigneeUserId: 'assignee-1',
      fallbackUserId: 'fallback-1',
      allowManualOverride: false,
    };
    const create = jest.fn(async (payload) => ({ ...savedRule, ...payload }));
    const getList = jest.fn(async () => ({
      items: [savedRule],
      total: 1,
      page: 1,
      pageSize: 20,
    }));

    const moduleRef = await Test.createTestingModule({
      controllers: [DispatchRulesController],
      providers: [
        {
          provide: DispatchRulesService,
          useValue: {
            create,
            getList,
            getById: jest.fn(),
            update: jest.fn(),
            softDelete: jest.fn(),
            simulate: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            getRepository: jest.fn(() => ({
              create: jest.fn((entity) => entity),
              save: jest.fn(async (entity) => entity),
            })),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    const payload = {
      ruleName: savedRule.ruleName,
      orderType: savedRule.orderType,
      targetModule: savedRule.targetModule,
      triggerConditions: null,
      dispatchStrategy: savedRule.dispatchStrategy,
      priority: savedRule.priority,
      isActive: savedRule.isActive,
      subModule: savedRule.subModule,
      customerId: savedRule.customerId,
      departmentId: savedRule.departmentId,
      assigneeUserId: savedRule.assigneeUserId,
      fallbackUserId: savedRule.fallbackUserId,
      allowManualOverride: savedRule.allowManualOverride,
    };

    const created = await request(app.getHttpServer())
      .post('/admin/dispatch-rules')
      .send(payload)
      .expect(201);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      subModule: savedRule.subModule,
      customerId: savedRule.customerId,
      departmentId: savedRule.departmentId,
      assigneeUserId: savedRule.assigneeUserId,
      fallbackUserId: savedRule.fallbackUserId,
      allowManualOverride: savedRule.allowManualOverride,
    }));
    expect(created.body).toEqual(expect.objectContaining({
      subModule: savedRule.subModule,
      customerId: savedRule.customerId,
      departmentId: savedRule.departmentId,
      assigneeUserId: savedRule.assigneeUserId,
      fallbackUserId: savedRule.fallbackUserId,
      allowManualOverride: savedRule.allowManualOverride,
    }));

    const list = await request(app.getHttpServer())
      .get('/admin/dispatch-rules')
      .expect(200);

    expect(list.body.items[0]).toEqual(expect.objectContaining({
      subModule: savedRule.subModule,
      customerId: savedRule.customerId,
      departmentId: savedRule.departmentId,
      assigneeUserId: savedRule.assigneeUserId,
      fallbackUserId: savedRule.fallbackUserId,
      allowManualOverride: savedRule.allowManualOverride,
    }));
  });
});
