import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { DataSource } from 'typeorm';
import { CustomerPortalAccountsController, PortalAuthController } from 'src/modules/customer-portal-accounts/customer-portal-accounts.controller';
import { CustomerPortalAccountsService } from 'src/modules/customer-portal-accounts/customer-portal-accounts.service';

describe('CustomerPortalAccountsController HTTP validation', () => {
  let app: INestApplication;
  const service = { create: jest.fn(async (_id, value) => value), update: jest.fn(async (_id, _accountId, value) => value),
    resetPassword: jest.fn(async () => ({})), login: jest.fn(async () => ({})), session: jest.fn(async () => ({})), changePassword: jest.fn(async () => ({})) };
  const accountPath = '/customer-config/customers/11111111-1111-4111-8111-111111111111/accounts';
  const account = { loginEmail: 'portal@example.test', contactName: '业务联系人', password: 'Password123', businessPermissions: ['employee_changes'] };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [CustomerPortalAccountsController, PortalAuthController],
      providers: [
        { provide: CustomerPortalAccountsService, useValue: service },
        { provide: DataSource, useValue: { getRepository: () => ({ create: (value: unknown) => value, save: async (value: unknown) => value }) } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use((request: { user?: unknown }, _response: unknown, next: () => void) => {
      request.user = { sub: 'controller-user', username: 'controller-user', roles: ['admin'], businessScope: 'beilun' };
      next();
    });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterEach(async () => { await app?.close(); });

  it('requires explicit valid nonempty grants and rejects forged grants', async () => {
    for (const businessPermissions of [undefined, [], ['admin'], ['salary', 'salary'], 'salary']) {
      await request(app.getHttpServer()).post(accountPath).send({ ...account, businessPermissions }).expect(400);
    }
    expect(service.create).not.toHaveBeenCalled();
    await request(app.getHttpServer()).post(accountPath).send(account).expect(201);
    expect(service.create).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ businessPermissions: ['employee_changes'] }),
      expect.objectContaining({ sub: 'controller-user', roles: ['admin'], businessScope: 'beilun' }),
    );
  });

  it('preserves false booleans and refuses string coercion on all account mutation endpoints', async () => {
    const created = await request(app.getHttpServer()).post(accountPath).send({ ...account, isActive: false, mustChangePassword: false }).expect(201);
    expect(created.body).toMatchObject({ isActive: false, mustChangePassword: false });
    await request(app.getHttpServer()).post(accountPath).send({ ...account, isActive: 'false' }).expect(400);
    await request(app.getHttpServer()).put(`${accountPath}/account-1`).send({ isActive: 'false' }).expect(400);
    await request(app.getHttpServer()).post(`${accountPath}/account-1/reset-password`).send({ password: 'Password123', mustChangePassword: 'false' }).expect(400);
    expect(service.update).not.toHaveBeenCalled();
    expect(service.resetPassword).not.toHaveBeenCalled();
  });

  it('uses signed session tokens and exact oldPassword/newPassword contract with strict business validation', async () => {
    await request(app.getHttpServer()).post('/portal-auth/session').send({ linkToken: 'signed-link', businessType: 'salary' }).expect(201);
    expect(service.session).toHaveBeenCalledWith('signed-link', 'salary');
    await request(app.getHttpServer()).post('/portal-auth/session').send({ linkToken: 'signed-link', businessType: 'admin' }).expect(400);
    await request(app.getHttpServer()).post('/portal-auth/change-password').send({ linkToken: 'signed-link', oldPassword: 'OldPassword123', newPassword: 'NewPassword123' }).expect(201);
    expect(service.changePassword).toHaveBeenCalledWith('signed-link', 'OldPassword123', 'NewPassword123');
    await request(app.getHttpServer()).post('/portal-auth/change-password').send({ linkToken: 'signed-link', old_password: 'OldPassword123', newPassword: 'NewPassword123' }).expect(400);
    expect(service.changePassword).toHaveBeenCalledTimes(1);
  });
});
