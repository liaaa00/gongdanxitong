import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { FieldPermissionController } from 'src/modules/admin/field-permissions/field-permission.controller';
import { FieldPermissionService } from 'src/modules/admin/field-permissions/field-permission.service';
import { FieldsController } from 'src/modules/admin/fields/fields.controller';
import { FieldsService } from 'src/modules/admin/fields/fields.service';

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
    controllers: [FieldPermissionController, FieldsController],
    providers: [
      Reflector,
      { provide: DataSource, useValue: { getRepository: jest.fn() } },
      { provide: FieldPermissionService, useValue: { getMatrix: jest.fn(async () => ({ scenarios: [], matrix: {} })) } },
      { provide: FieldsService, useValue: { list: jest.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 20 })) } },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  const roleActionPermissionService = { hasAnyRoleAction: jest.fn(async () => false) };
  app.useGlobalGuards(new TestUserGuard(roles), new RolesGuard(moduleRef.get(Reflector), roleActionPermissionService as never));
  await app.init();
  return app;
}

describe('admin field HTTP permissions', () => {
  let app: INestApplication;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it.each([
    '/api/admin/fields?page=1&pageSize=2',
    '/api/admin/field-permissions/matrix',
  ])('returns 403 for non-admin GET %s', async (path) => {
    app = await createApp(['biz_member']);

    await request(app.getHttpServer()).get(path).expect(403);
  });

  it.each([
    '/api/admin/fields?page=1&pageSize=2',
    '/api/admin/field-permissions/matrix',
  ])('allows admin GET %s', async (path) => {
    app = await createApp(['admin']);

    await request(app.getHttpServer()).get(path).expect(200);
  });
});
