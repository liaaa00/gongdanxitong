import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { PermissionCenterController } from 'src/modules/permission-center/controllers/permission-center.controller';
import { PermissionNotificationGateway } from 'src/modules/permission-center/gateways/permission-notification.gateway';
import { PermissionCacheService } from 'src/modules/permission-center/services/permission-cache.service';
import { PermissionCenterService } from 'src/modules/permission-center/services/permission-center.service';

class TestUserGuard implements CanActivate {
  constructor(private readonly roles: string[]) {}

  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest().user = {
      sub: 'user-1',
      id: 'user-1',
      username: 'test-user',
      roles: this.roles,
    };
    return true;
  }
}

const activeConfig = {
  version: '1.1.0',
  roles: [],
  routePermissions: [],
  fieldPermissions: [],
};

async function createApp(roles: string[]): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [PermissionCenterController],
    providers: [
      Reflector,
      {
        provide: PermissionCenterService,
        useValue: {
          getActiveConfig: jest.fn(async () => activeConfig),
          getAllVersions: jest.fn(async () => []),
          getVersionById: jest.fn(),
          createVersion: jest.fn(),
          activateVersion: jest.fn(),
          getRoutePermissionsForRole: jest.fn(async () => []),
          getFieldPermissionsForRole: jest.fn(async () => ({})),
        },
      },
      { provide: PermissionCacheService, useValue: { clearPermissionCache: jest.fn() } },
      { provide: PermissionNotificationGateway, useValue: { broadcastConfigActivated: jest.fn() } },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({ canActivate: () => true })
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  const roleActionPermissionService = { hasAnyRoleAction: jest.fn(async () => false) };
  app.useGlobalGuards(
    new TestUserGuard(roles),
    new RolesGuard(moduleRef.get(Reflector), roleActionPermissionService as never),
  );
  await app.init();
  return app;
}

describe('permission center HTTP permissions', () => {
  let app: INestApplication;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('allows any authenticated role to read the active runtime configuration', async () => {
    app = await createApp(['welfare_specialist']);

    await request(app.getHttpServer())
      .get('/api/permission-center/config')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual(activeConfig);
      });
  });

  it('keeps permission version management admin-only', async () => {
    app = await createApp(['welfare_specialist']);

    await request(app.getHttpServer()).get('/api/permission-center/versions').expect(403);
    await request(app.getHttpServer())
      .post('/api/permission-center/config')
      .send({ config: activeConfig })
      .expect(403);
  });
});
