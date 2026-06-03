import * as request from 'supertest';
import { Test } from '@nestjs/testing';
import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FieldPermissionController } from 'src/modules/admin/field-permissions/field-permission.controller';
import {
  FIELD_PERMISSION_MATRIX_SCENARIOS,
  FieldPermissionService,
} from 'src/modules/admin/field-permissions/field-permission.service';

class AdminUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest().user = {
      sub: 'admin-1',
      username: 'admin',
      roles: ['admin'],
    };
    return true;
  }
}

describe('Admin field permission matrix', () => {
  let app: INestApplication;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /admin/field-permissions/matrix returns 12 phase-1 scenario columns with social insurance reduction and no resignation cert legacy column', async () => {
    const getMatrix = jest.fn().mockResolvedValue({
      scenarios: [...FIELD_PERMISSION_MATRIX_SCENARIOS],
      matrix: {},
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [FieldPermissionController],
      providers: [
        {
          provide: FieldPermissionService,
          useValue: { getMatrix },
        },
        {
          provide: DataSource,
          useValue: { getRepository: jest.fn() },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalGuards(new AdminUserGuard());
    await app.init();

    const response = await request(app.getHttpServer())
      .get('/admin/field-permissions/matrix')
      .expect(200);

    expect(getMatrix).toHaveBeenCalledTimes(1);
    expect(response.body.scenarios).toHaveLength(12);
    expect(response.body.scenarios).toEqual([...FIELD_PERMISSION_MATRIX_SCENARIOS]);
    expect(response.body.scenarios).toContain('dispatched:resignation_social_insurance');
    expect(response.body.scenarios).not.toContain('dispatched:resignation_cert');
  });
});
