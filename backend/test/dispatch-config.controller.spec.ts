import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DispatchConfigController } from 'src/modules/admin/dispatch-rules/dispatch-config.controller';
import { DispatchRulesService } from 'src/modules/admin/dispatch-rules/dispatch-rules.service';

describe('DispatchConfigController', () => {
  let app: INestApplication;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns rows with source, module and customerName fields', async () => {
    const getDispatchConfig = jest.fn(async () => ({
      rows: [
        {
          id: 'handler-row-1',
          source: 'handlers',
          module: 'data_entry',
          subModule: 'data_entry',
          customerName: 'all customers',
          customerId: null,
          primary: { userId: 'handler-1', displayName: 'Anna Zhen' },
          backup1: null,
          backup2: null,
        },
      ],
    }));

    const moduleRef = await Test.createTestingModule({
      controllers: [DispatchConfigController],
      providers: [
        {
          provide: DispatchRulesService,
          useValue: { getDispatchConfig },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const response = await request(app.getHttpServer())
      .get('/admin/dispatch-config')
      .expect(200);

    expect(getDispatchConfig).toHaveBeenCalledTimes(1);
    expect(response.body.rows).toEqual(expect.any(Array));
    expect(response.body.rows[0]).toEqual(expect.objectContaining({
      source: expect.any(String),
      module: expect.any(String),
      customerName: expect.any(String),
    }));
  });
});
