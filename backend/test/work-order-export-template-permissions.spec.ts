import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { RolesGuard } from 'src/common/guards/roles.guard';
import {
  ExportTemplatesController,
  WorkOrderExportTemplatesController,
} from 'src/modules/admin/export-templates/export-templates.controller';
import { ExportTemplatesService } from 'src/modules/admin/export-templates/export-templates.service';

class TestUserGuard implements CanActivate {
  constructor(private readonly roles: string[]) {}

  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest().user = {
      sub: 'user-1',
      username: 'user-1',
      roles: this.roles,
    };
    return true;
  }
}

async function createApp(roles: string[]) {
  const exportTemplatesService = {
    listSharedContractTemplates: jest.fn(async () => [{ id: 'tpl-contract', moduleCode: 'contract' }]),
    list: jest.fn(),
    get: jest.fn(),
    previewApply: jest.fn(),
    apply: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [ExportTemplatesController, WorkOrderExportTemplatesController],
    providers: [
      Reflector,
      { provide: DataSource, useValue: { getRepository: jest.fn() } },
      { provide: ExportTemplatesService, useValue: exportTemplatesService },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  const roleActionPermissionService = { hasAnyRoleAction: jest.fn(async () => false) };
  app.useGlobalGuards(
    new TestUserGuard(roles),
    new RolesGuard(moduleRef.get(Reflector), roleActionPermissionService as never),
  );
  await app.init();
  return { app, exportTemplatesService };
}

describe('work-order export template read permissions', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
  });

  it.each([['biz_member'], ['admin']])('allows %s to read shared contract templates', async (role) => {
    const created = await createApp([role]);
    app = created.app;

    await request(app.getHttpServer())
      .get('/api/work-order-export-templates/contract')
      .expect(200)
      .expect([{ id: 'tpl-contract', moduleCode: 'contract' }]);
    expect(created.exportTemplatesService.listSharedContractTemplates).toHaveBeenCalledTimes(1);
  });

  it.each([['salesperson'], ['business_group_member'], ['labor_contract_member']])(
    'keeps the read endpoint closed to unrelated role %s',
    async (role) => {
      const created = await createApp([role]);
      app = created.app;

      await request(app.getHttpServer())
        .get('/api/work-order-export-templates/contract')
        .expect(403);
      expect(created.exportTemplatesService.listSharedContractTemplates).not.toHaveBeenCalled();
    },
  );

  it('keeps all admin template routes closed to biz_member', async () => {
    const created = await createApp(['biz_member']);
    app = created.app;
    const id = '00000000-0000-4000-8000-000000000001';

    await request(app.getHttpServer()).get('/api/admin/export-templates').expect(403);
    await request(app.getHttpServer()).get('/api/export-templates').expect(403);
    await request(app.getHttpServer()).post('/api/admin/export-templates').send({}).expect(403);
    await request(app.getHttpServer()).put(`/api/admin/export-templates/${id}`).send({}).expect(403);
    await request(app.getHttpServer()).delete(`/api/admin/export-templates/${id}`).expect(403);
  });

  it('queries only shared contract templates for the two supported platforms', async () => {
    const repository = { find: jest.fn(async () => []) };
    const fieldConfigRepository = { find: jest.fn(async () => []) };
    const service = new ExportTemplatesService(
      repository as never,
      {} as never,
      {} as never,
      fieldConfigRepository as never,
      {} as never,
      {} as never,
    );

    await expect(service.listSharedContractTemplates()).resolves.toEqual([]);
    expect(repository.find).toHaveBeenCalledWith({
      where: [
        { moduleCode: 'contract', isShared: true, signPlatform: '速创' },
        { moduleCode: 'contract', isShared: true, signPlatform: 'E签宝' },
      ],
      order: { createdAt: 'DESC' },
    });
  });
});
