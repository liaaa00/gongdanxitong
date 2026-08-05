import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CustomersController } from 'src/modules/admin/customers/customers.controller';
import { CustomersService } from 'src/modules/admin/customers/customers.service';
import { DepartmentsController } from 'src/modules/admin/departments/departments.controller';
import { DepartmentsService } from 'src/modules/admin/departments/departments.service';

class TestUserGuard implements CanActivate {
  constructor(private readonly roles: string[]) {}

  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest().user = {
      sub: 'user-1',
      username: 'test-user',
      roles: this.roles,
    };
    return true;
  }
}

async function createApp(roles: string[]): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [CustomersController, DepartmentsController],
    providers: [
      Reflector,
      { provide: DataSource, useValue: { getRepository: jest.fn() } },
      { provide: CustomersService, useValue: { list: jest.fn(async () => []) } },
      { provide: DepartmentsService, useValue: { getTree: jest.fn(async () => []) } },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  const roleActionPermissionService = { hasAnyRoleAction: jest.fn(async () => false) };
  app.useGlobalGuards(new TestUserGuard(roles), new RolesGuard(moduleRef.get(Reflector), roleActionPermissionService as never));
  await app.init();
  return app;
}

describe('reference data HTTP permissions', () => {
  let app: INestApplication;

  afterEach(async () => {
    if (app) await app.close();
  });

  it.each([
    ['biz_member', 'business_group_member'],
    ['biz_leader', 'business_group_leader'],
    ['biz_manager', 'business_owner'],
  ])('allows %s to read customer and department options', async (role) => {
    app = await createApp([role]);
    await request(app.getHttpServer()).get('/api/admin/customers?page=1&pageSize=2').expect(200);
    await request(app.getHttpServer()).get('/api/admin/departments').expect(200);
  });

  it('keeps customer and department writes admin-only', async () => {
    app = await createApp(['biz_member']);
    await request(app.getHttpServer()).post('/api/admin/customers').send({ customerName: '禁止写入' }).expect(403);
    await request(app.getHttpServer()).post('/api/admin/departments').send({ code: 'forbidden', name: '禁止写入' }).expect(403);
  });
});
