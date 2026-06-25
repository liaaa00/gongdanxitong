import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { FieldsService } from 'src/modules/admin/fields/fields.service';
import { ImportsController } from 'src/modules/imports/imports.controller';
import { ImportJobService } from 'src/modules/imports/import-job.service';
import { ImportTemplateConfigService } from 'src/modules/imports/import-template-config.service';
import { ImportTemplateService } from 'src/modules/imports/import-template.service';
import { UploadsService } from 'src/modules/uploads/uploads.service';

class TestUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest().user = {
      sub: 'sales-1',
      username: 'sales',
      roles: ['business_group_member'],
    };
    return true;
  }
}

describe('create work-order fields permission', () => {
  async function createApp(canCreate: boolean): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      controllers: [ImportsController],
      providers: [
        Reflector,
        { provide: ImportJobService, useValue: {} },
        { provide: UploadsService, useValue: {} },
        { provide: FieldsService, useValue: {} },
        { provide: ImportTemplateService, useValue: {} },
        { provide: ImportTemplateConfigService, useValue: { list: jest.fn(async () => [{ field_code: 'employee_name', field_name: '姓名' }]) } },
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    const roleActionPermissionService = { hasAnyRoleAction: jest.fn(async (_roles: string[], action: string) => canCreate && action === 'work_order.create') };
    app.useGlobalGuards(new TestUserGuard(), new RolesGuard(moduleRef.get(Reflector), roleActionPermissionService as never));
    await app.init();
    return app;
  }

  it('allows reading create fields with work_order.create permission', async () => {
    const app = await createApp(true);
    try {
      await request(app.getHttpServer())
        .get('/work-orders/create/fields?orderType=onboarding')
        .expect(200)
        .expect(({ body }) => {
          expect(body[0].field_code).toBe('employee_name');
        });
    } finally {
      await app.close();
    }
  });

  it('blocks reading create fields without work_order.create permission', async () => {
    const app = await createApp(false);
    try {
      await request(app.getHttpServer())
        .get('/work-orders/create/fields?orderType=onboarding')
        .expect(403);
    } finally {
      await app.close();
    }
  });
});
