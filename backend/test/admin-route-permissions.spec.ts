import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { DispatchConfigController } from 'src/modules/admin/dispatch-rules/dispatch-config.controller';
import { DispatchRulesService } from 'src/modules/admin/dispatch-rules/dispatch-rules.service';
import { ExportTemplatesController } from 'src/modules/admin/export-templates/export-templates.controller';
import { ExportTemplatesService } from 'src/modules/admin/export-templates/export-templates.service';
import { FieldPermissionController } from 'src/modules/admin/field-permissions/field-permission.controller';
import { FieldPermissionService } from 'src/modules/admin/field-permissions/field-permission.service';
import { FieldsController } from 'src/modules/admin/fields/fields.controller';
import { FieldsService } from 'src/modules/admin/fields/fields.service';
import { ModuleConfigsController } from 'src/modules/admin/module-configs/module-configs.controller';
import { ModuleConfigsService } from 'src/modules/admin/module-configs/module-configs.service';
import { WorkflowController } from 'src/modules/workflows/workflow.controller';
import { WorkflowService } from 'src/modules/workflows/workflow.service';

class NonAdminUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest().user = {
      sub: 'sales-1',
      username: 'sales',
      roles: ['salesperson'],
    };
    return true;
  }
}

describe('admin route role permissions', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        FieldPermissionController,
        FieldsController,
        ExportTemplatesController,
        ModuleConfigsController,
        DispatchConfigController,
        WorkflowController,
      ],
      providers: [
        Reflector,
        { provide: DataSource, useValue: { getRepository: jest.fn() } },
        { provide: FieldPermissionService, useValue: { getMatrix: jest.fn(), batchUpsert: jest.fn(), copyToRoles: jest.fn() } },
        { provide: FieldsService, useValue: { list: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn(), reorder: jest.fn() } },
        { provide: ExportTemplatesService, useValue: { list: jest.fn(), get: jest.fn(), previewApply: jest.fn(), apply: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn() } },
        { provide: ModuleConfigsService, useValue: { listModules: jest.fn(), saveModule: jest.fn(), updateModule: jest.fn(), listModuleFields: jest.fn(), replaceModuleFields: jest.fn(), listSupervisors: jest.fn(), saveSupervisor: jest.fn(), listActions: jest.fn(), saveAction: jest.fn() } },
        { provide: DispatchRulesService, useValue: { getDispatchConfig: jest.fn() } },
        { provide: WorkflowService, useValue: { list: jest.fn(), get: jest.fn(), create: jest.fn(), update: jest.fn(), publish: jest.fn(), remove: jest.fn() } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    const roleActionPermissionService = { hasAnyRoleAction: jest.fn(async () => false) };
    app.useGlobalGuards(new NonAdminUserGuard(), new RolesGuard(moduleRef.get(Reflector), roleActionPermissionService as never));
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it.each([
    ['/admin/field-permissions/matrix'],
    ['/admin/fields'],
    ['/admin/export-templates'],
    ['/admin/export-templates/00000000-0000-4000-8000-000000000001'],
    ['/export-templates'],
    ['/export-templates/00000000-0000-4000-8000-000000000001'],
    ['/admin/work-order-modules'],
    ['/admin/modules/contract/fields'],
    ['/admin/module-supervisors'],
    ['/admin/action-configs'],
    ['/admin/dispatch-config'],
    ['/admin/workflows'],
    ['/admin/workflows/00000000-0000-4000-8000-000000000001'],
  ])('returns 403 for non-admin GET %s', async (path) => {
    await request(app.getHttpServer()).get(path).expect(403);
  });

  it.each([
    ['/admin/field-permissions/batch', { items: [] }],
    ['/admin/field-permissions/copy', { sourceRoleId: '00000000-0000-4000-8000-000000000001', targetRoleIds: [] }],
    ['/admin/fields', { fieldCode: 'mobile', fieldName: '手机', fieldType: 'text', isRequired: false, defaultRequired: false }],
    ['/admin/export-templates', { templateName: '模板', moduleCode: 'contract', fieldList: [] }],
    ['/admin/export-templates/00000000-0000-4000-8000-000000000001/apply-preview', { dispatchedOrderIds: [] }],
    ['/admin/export-templates/00000000-0000-4000-8000-000000000001/apply', { dispatchedOrderIds: [] }],
    ['/export-templates', { templateName: '模板', moduleCode: 'contract', fieldList: [] }],
    ['/export-templates/00000000-0000-4000-8000-000000000001/apply-preview', { dispatchedOrderIds: [] }],
    ['/export-templates/00000000-0000-4000-8000-000000000001/apply', { dispatchedOrderIds: [] }],
    ['/admin/work-order-modules', { moduleCode: 'contract', moduleName: '合同' }],
    ['/admin/module-supervisors', { moduleCode: 'contract', supervisorId: '00000000-0000-4000-8000-000000000001' }],
    ['/admin/action-configs', { moduleCode: 'contract', actionCode: 'complete', actionName: '完成' }],
    ['/admin/workflows', { name: '流程', order_type: 'onboarding', definition_json: { nodes: [] } }],
    ['/admin/workflows/00000000-0000-4000-8000-000000000001/publish', {}],
  ])('returns 403 for non-admin POST %s', async (path, body) => {
    await request(app.getHttpServer()).post(path).send(body).expect(403);
  });

  it.each([
    ['/admin/fields/00000000-0000-4000-8000-000000000001', { fieldName: '手机' }],
    ['/admin/export-templates/00000000-0000-4000-8000-000000000001', { templateName: '模板2' }],
    ['/export-templates/00000000-0000-4000-8000-000000000001', { templateName: '模板2' }],
    ['/admin/work-order-modules/00000000-0000-4000-8000-000000000001', { moduleName: '合同2' }],
    ['/admin/modules/contract/fields', { fields: [] }],
    ['/admin/workflows/00000000-0000-4000-8000-000000000001', { description: 'updated' }],
  ])('returns 403 for non-admin PUT %s', async (path, body) => {
    await request(app.getHttpServer()).put(path).send(body).expect(403);
  });

  it.each([
    ['/admin/fields/00000000-0000-4000-8000-000000000001'],
    ['/admin/export-templates/00000000-0000-4000-8000-000000000001'],
    ['/export-templates/00000000-0000-4000-8000-000000000001'],
    ['/admin/workflows/00000000-0000-4000-8000-000000000001'],
  ])('returns 403 for non-admin DELETE %s', async (path) => {
    await request(app.getHttpServer()).delete(path).expect(403);
  });
});
