import * as request from 'supertest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { DispatchModuleCode } from 'src/entities';
import { ExceptionModuleHandlersController } from 'src/modules/admin/exception-module-handlers/exception-module-handlers.controller';
import { ExceptionModuleHandlersService } from 'src/modules/admin/exception-module-handlers/exception-module-handlers.service';

const dataSourceMock = {
  getRepository: jest.fn(() => ({
    create: jest.fn((entity) => entity),
    save: jest.fn(async (entity) => entity),
  })),
};

describe('ExceptionModuleHandlersController DTO', () => {
  let app: INestApplication;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('accepts camelCase CRUD fields and supports query filters', async () => {
    const savedRule = {
      id: 'rule-1',
      moduleCode: DispatchModuleCode.CONTRACT,
      customerCode: 'C001',
      handlerId: '11111111-1111-4111-8111-111111111111',
    };
    const list = jest.fn(async () => [savedRule]);
    const create = jest.fn(async (payload) => ({ ...savedRule, ...payload }));
    const update = jest.fn(async (id, payload) => ({ ...savedRule, id, ...payload }));
    const remove = jest.fn(async () => ({ success: true }));

    const moduleRef = await Test.createTestingModule({
      controllers: [ExceptionModuleHandlersController],
      providers: [
        {
          provide: ExceptionModuleHandlersService,
          useValue: { list, create, update, remove },
        },
        { provide: DataSource, useValue: dataSourceMock },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    const payload = {
      moduleCode: DispatchModuleCode.CONTRACT,
      customerCode: 'C001',
      handlerId: savedRule.handlerId,
    };

    const created = await request(app.getHttpServer())
      .post('/admin/exception-module-handlers')
      .send(payload)
      .expect(201);

    expect(create).toHaveBeenCalledWith(payload);
    expect(created.body).toEqual(expect.objectContaining(payload));

    await request(app.getHttpServer())
      .get('/admin/exception-module-handlers')
      .query({ moduleCode: DispatchModuleCode.CONTRACT, customerCode: 'C001' })
      .expect(200);
    expect(list).toHaveBeenCalledWith({ moduleCode: DispatchModuleCode.CONTRACT, customerCode: 'C001' });

    const updated = await request(app.getHttpServer())
      .patch('/admin/exception-module-handlers/rule-1')
      .send({ handlerId: '22222222-2222-4222-8222-222222222222' })
      .expect(200);
    expect(update).toHaveBeenCalledWith('rule-1', { handlerId: '22222222-2222-4222-8222-222222222222' });
    expect(updated.body.handlerId).toBe('22222222-2222-4222-8222-222222222222');

    await request(app.getHttpServer())
      .delete('/admin/exception-module-handlers/rule-1')
      .expect(200);
    expect(remove).toHaveBeenCalledWith('rule-1');
  });

  it('rejects unsupported moduleCode values', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ExceptionModuleHandlersController],
      providers: [
        {
          provide: ExceptionModuleHandlersService,
          useValue: { list: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn() },
        },
        { provide: DataSource, useValue: dataSourceMock },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    await request(app.getHttpServer())
      .post('/admin/exception-module-handlers')
      .send({
        moduleCode: 'invalid_module',
        customerCode: 'C001',
        handlerId: '11111111-1111-4111-8111-111111111111',
      })
      .expect(400);
  });
});
