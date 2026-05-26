import { ValidationPipe } from '@nestjs/common';
import request = require('supertest');
import type { INestApplication } from '@nestjs/common';
import { HttpExceptionFilter } from 'src/common/filters/http-exception.filter';
import { ResponseInterceptor } from 'src/common/interceptors/response.interceptor';
import { traceIdMiddleware } from 'src/common/middleware/trace-id.middleware';

type HttpServer = Parameters<typeof request>[0];

type TokenSet = {
  accessToken: string;
  refreshToken?: string;
};

type ApiEnvelope = {
  code?: unknown;
  data?: unknown;
  message?: unknown;
  traceId?: unknown;
};

const DEFAULT_USERNAME = process.env.E2E_ADMIN_USERNAME ?? 'lizhanbo';
const DEFAULT_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '123456';
const TEMP_PASSWORD = process.env.E2E_TEMP_PASSWORD ?? 'Admin123456!';
const EXTERNAL_BASE_URL = process.env.E2E_BASE_URL;

let app: INestApplication | undefined;
let server: HttpServer;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function unwrapData(responseBody: unknown): unknown {
  const record = asRecord(responseBody);
  return record && 'data' in record ? record.data : responseBody;
}

function expectApiEnvelope(responseBody: unknown): void {
  const envelope = asRecord(responseBody) as ApiEnvelope | undefined;
  expect(envelope).toBeDefined();
  expect(envelope).toHaveProperty('code');
  expect(envelope).toHaveProperty('data');
  expect(envelope).toHaveProperty('message');
  expect(envelope).toHaveProperty('traceId');
}

function expectNoPasswordHash(responseBody: unknown): void {
  expect(JSON.stringify(responseBody)).not.toContain('password_hash');
  expect(JSON.stringify(responseBody)).not.toContain('passwordHash');
}

function readToken(responseBody: unknown, keys: readonly string[]): string | undefined {
  const record = asRecord(responseBody);
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  const data = unwrapData(record);
  if (data !== record) {
    return readToken(data, keys);
  }

  return undefined;
}

function readAccessToken(responseBody: unknown): string | undefined {
  return readToken(responseBody, ['accessToken', 'access_token', 'token', 'jwt']);
}

function readRefreshToken(responseBody: unknown): string | undefined {
  return readToken(responseBody, ['refreshToken', 'refresh_token']);
}

async function login(username = DEFAULT_USERNAME, password = DEFAULT_PASSWORD): Promise<TokenSet> {
  const response = await request(server)
    .post('/api/auth/login')
    .send({ username, password })
    .expect((res) => {
      expect([200, 201]).toContain(res.status);
    });

  expectApiEnvelope(response.body);
  const accessToken = readAccessToken(response.body);
  expect(accessToken).toBeDefined();

  return {
    accessToken: accessToken as string,
    refreshToken: readRefreshToken(response.body),
  };
}

async function changePassword(accessToken: string, oldPassword: string, newPassword: string): Promise<void> {
  const response = await request(server)
    .post('/api/auth/change-password')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ oldPassword, newPassword })
    .expect((res) => {
      expect([200, 201, 204]).toContain(res.status);
    });

  if (response.status !== 204) {
    expectApiEnvelope(response.body);
  }
}

async function bootstrapLocalNestApplication(): Promise<INestApplication> {
  const testing = await import('@nestjs/testing');
  const mainModule = await import('../src/app.module');
  const appModule = mainModule.AppModule;
  if (!appModule) {
    throw new Error('Cannot import AppModule from ../src/app.module. Please check backend entry.');
  }

  const moduleFixture = await testing.Test.createTestingModule({ imports: [appModule] }).compile();
  const nestApp = moduleFixture.createNestApplication();
  nestApp.setGlobalPrefix('api');
  nestApp.use(traceIdMiddleware);
  nestApp.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  nestApp.useGlobalInterceptors(new ResponseInterceptor());
  nestApp.useGlobalFilters(new HttpExceptionFilter());
  await nestApp.init();
  return nestApp;
}

beforeAll(async () => {
  if (EXTERNAL_BASE_URL) {
    server = EXTERNAL_BASE_URL;
    return;
  }

  app = await bootstrapLocalNestApplication();
  server = app.getHttpServer();
});

afterAll(async () => {
  if (app) {
    await app.close();
  }
});

describe('Auth API (e2e)', () => {
  it('POST /api/auth/login should return JWT for admin credentials', async () => {
    const response = await request(server)
      .post('/api/auth/login')
      .send({ username: DEFAULT_USERNAME, password: DEFAULT_PASSWORD })
      .expect((res) => {
        expect([200, 201]).toContain(res.status);
      });

    expectApiEnvelope(response.body);
    expect(readAccessToken(response.body)).toBeDefined();
    expectNoPasswordHash(response.body);
  });

  it('POST /api/auth/login should reject wrong password', async () => {
    const response = await request(server)
      .post('/api/auth/login')
      .send({ username: DEFAULT_USERNAME, password: 'wrong-password' })
      .expect(401);

    expectApiEnvelope(response.body);
    expect(readAccessToken(response.body)).toBeUndefined();
  });

  it('POST /api/auth/login should validate required payload', async () => {
    const response = await request(server)
      .post('/api/auth/login')
      .send({ username: DEFAULT_USERNAME })
      .expect((res) => {
        expect([400, 422]).toContain(res.status);
      });

    expectApiEnvelope(response.body);
  });

  it('GET /api/auth/me should return current user with valid JWT', async () => {
    const { accessToken } = await login();

    const response = await request(server)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expectApiEnvelope(response.body);
    expect(JSON.stringify(response.body)).toContain(DEFAULT_USERNAME);
    expectNoPasswordHash(response.body);
  });

  it('GET /api/auth/me should reject anonymous request', async () => {
    const response = await request(server).get('/api/auth/me').expect(401);
    expectApiEnvelope(response.body);
  });

  it('GET /api/auth/me should reject invalid JWT', async () => {
    const response = await request(server)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.token.value')
      .expect(401);

    expectApiEnvelope(response.body);
  });

  it('POST /api/auth/refresh should return a fresh access token when refresh token is available', async () => {
    const { refreshToken } = await login();

    if (!refreshToken) {
      console.warn('Login response did not include refreshToken; refresh scenario skipped.');
      return;
    }

    const response = await request(server)
      .post('/api/auth/refresh')
      .send({ refreshToken })
      .expect((res) => {
        expect([200, 201]).toContain(res.status);
      });

    expectApiEnvelope(response.body);
    expect(readAccessToken(response.body)).toBeDefined();
  });

  it('POST /api/auth/refresh should reject invalid refresh token', async () => {
    const response = await request(server)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'invalid-refresh-token' })
      .expect((res) => {
        expect([400, 401]).toContain(res.status);
      });

    expectApiEnvelope(response.body);
  });

  it('POST /api/auth/change-password should update password and allow login with new password', async () => {
    const { accessToken } = await login();
    let restored = false;

    try {
      await changePassword(accessToken, DEFAULT_PASSWORD, TEMP_PASSWORD);
      await login(DEFAULT_USERNAME, TEMP_PASSWORD);

      const { accessToken: tempToken } = await login(DEFAULT_USERNAME, TEMP_PASSWORD);
      await changePassword(tempToken, TEMP_PASSWORD, DEFAULT_PASSWORD);
      restored = true;
    } finally {
      if (!restored) {
        try {
          const { accessToken: tempToken } = await login(DEFAULT_USERNAME, TEMP_PASSWORD);
          await changePassword(tempToken, TEMP_PASSWORD, DEFAULT_PASSWORD);
        } catch {
          // Keep the original failure instead of masking it.
        }
      }
    }
  });

  it('POST /api/auth/change-password should reject wrong old password', async () => {
    const { accessToken } = await login();

    const response = await request(server)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ oldPassword: 'wrong-old-password', newPassword: TEMP_PASSWORD })
      .expect((res) => {
        expect([400, 401]).toContain(res.status);
      });

    expectApiEnvelope(response.body);
  });

  it('POST /api/auth/logout should accept authenticated logout', async () => {
    const { accessToken } = await login();

    const response = await request(server)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect((res) => {
        expect([200, 201, 204]).toContain(res.status);
      });

    if (response.status !== 204) {
      expectApiEnvelope(response.body);
    }
  });
});
