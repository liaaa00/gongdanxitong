import { Controller, Get, INestApplication, Param } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { HttpExceptionFilter } from 'src/common/filters/http-exception.filter';
import { ResponseInterceptor } from 'src/common/interceptors/response.interceptor';
import { traceIdMiddleware } from 'src/common/middleware/trace-id.middleware';
import { assertUuidParam } from 'src/common/utils/uuid-param';

@Controller('work-orders')
class TestWorkOrdersController {
  @Get(':id')
  detail(@Param('id') id: string) {
    return { id: assertUuidParam(id, '工单不存在') };
  }
}

@Controller('dispatched-orders')
class TestDispatchedOrdersController {
  @Get(':id/supplement-logs')
  supplementLogs(@Param('id') id: string) {
    assertUuidParam(id, '子工单不存在');
    return [];
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return { id: assertUuidParam(id, '子工单不存在') };
  }
}

describe('detail invalid id 404 normalization (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestWorkOrdersController, TestDispatchedOrdersController],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(traceIdMiddleware);
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/work-orders/not-exist-qa returns 404', async () => {
    const response = await request(app.getHttpServer()).get('/api/work-orders/not-exist-qa').expect(404);
    expect(response.body).toMatchObject({ code: 404, data: null, message: '工单不存在' });
  });

  it('GET /api/dispatched-orders/not-exist-qa returns 404', async () => {
    const response = await request(app.getHttpServer()).get('/api/dispatched-orders/not-exist-qa').expect(404);
    expect(response.body).toMatchObject({ code: 404, data: null, message: '子工单不存在' });
  });

  it('GET /api/dispatched-orders/not-exist-qa/supplement-logs returns 404', async () => {
    const response = await request(app.getHttpServer()).get('/api/dispatched-orders/not-exist-qa/supplement-logs').expect(404);
    expect(response.body).toMatchObject({ code: 404, data: null, message: '子工单不存在' });
  });
});
