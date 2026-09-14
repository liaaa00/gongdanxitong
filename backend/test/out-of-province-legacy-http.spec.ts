import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request = require('supertest');
import { BusinessScope, OrderType, WorkOrder } from 'src/entities';
import { OutOfProvinceOrdersController } from 'src/modules/out-of-province-orders/out-of-province-orders.controller';
import { OutOfProvinceOrdersService } from 'src/modules/out-of-province-orders/out-of-province-orders.service';

describe('legacy province HTTP write retirement', () => {
  let app: INestApplication;
  const id = '11111111-1111-4111-8111-111111111111';
  const writes = { createDraft: jest.fn(), update: jest.fn(), submit: jest.fn(), resubmit: jest.fn() };
  const row = Object.assign(new WorkOrder(), {
    id, createdBy: 'owner', orderType: OrderType.OUT_OF_PROVINCE_INCREASE,
    businessScope: BusinessScope.OUT_OF_PROVINCE, dispatchedOrders: [], extraData: {},
    createdAt: new Date(), updatedAt: new Date(),
    creator: { id: 'owner', username: 'owner', realName: 'Test Owner' },
    department: { id: 'department', name: 'Test Department' },
    customer: { id: 'customer', customerCode: 'TEST', customerName: 'Test Customer' },
  });

  beforeAll(async () => {
    const service = new OutOfProvinceOrdersService(
      { findOne: async () => row } as never, {} as never, writes as never,
      {} as never, { hasAnyRoleAction: async () => true } as never,
    );
    const module = await Test.createTestingModule({
      controllers: [OutOfProvinceOrdersController],
      providers: [
        { provide: OutOfProvinceOrdersService, useValue: service },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use((req: { user?: unknown }, _res: unknown, next: () => void) => {
      req.user = { sub: 'owner', username: 'owner', roles: ['admin'] };
      next();
    });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => { await app?.close(); });

  it('returns 410 for all four legacy write routes without invoking main-order writes', async () => {
    const http = request(app.getHttpServer());
    await http.post('/out-of-province-orders').send({
      orderType: row.orderType, province: '福建', extraData: {},
    }).expect(410);
    await http.put(`/out-of-province-orders/${id}`).send({ extraData: {} }).expect(410);
    await http.post(`/out-of-province-orders/${id}/submit`).send({}).expect(410);
    await http.post(`/out-of-province-orders/${id}/resubmit`).send({}).expect(410);
    for (const write of Object.values(writes)) expect(write).not.toHaveBeenCalled();
  });

  it('keeps authorized historical detail readable', async () => {
    const response = await request(app.getHttpServer()).get(`/out-of-province-orders/${id}`).expect(200);
    expect(response.body.id).toBe(id);
    expect(response.body.businessScope).toBe(BusinessScope.OUT_OF_PROVINCE);
  });
});
