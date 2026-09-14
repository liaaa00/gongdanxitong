import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), '..');

function readRootFile(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('Production deployment assets', () => {
  it('supports native dependency fallback builds and includes only the approved repair script at runtime', () => {
    const dockerfile = readRootFile('backend/Dockerfile');
    expect(dockerfile.split('FROM node:20-alpine AS build')[0]).toContain('apk add --no-cache python3 make g++');
    expect(dockerfile).toContain('ENV npm_config_nodedir=/usr/local');
    expect(dockerfile).toContain('ENV npm_config_build_from_source=true');
    const runtime = dockerfile.split('FROM node:20-alpine AS runtime')[1];
    expect(runtime).toContain('COPY --from=build /app/scripts/repair-onboarding-contact-bank-orders.ts ./scripts/repair-onboarding-contact-bank-orders.ts');
    expect(runtime).not.toContain('apk add');
    expect(runtime).not.toContain('COPY --from=build /app/scripts ./scripts');
  });

  it('requires production secrets and keeps PostgreSQL off public interfaces', () => {
    const baseCompose = readRootFile('docker-compose.yml');
    const productionCompose = readRootFile('docker-compose.production.yml');

    expect(baseCompose).toContain(
      '${POSTGRES_BIND_ADDRESS:-127.0.0.1}:${POSTGRES_PORT:-5432}:5432',
    );
    expect(productionCompose).toContain(
      'POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}',
    );
    expect(productionCompose).toContain(
      'JWT_SECRET: ${JWT_SECRET:?JWT_SECRET is required}',
    );
    expect(productionCompose).toContain(
      'JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET:?JWT_REFRESH_SECRET is required}',
    );
    expect(productionCompose).toContain(
      'GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD:?GRAFANA_ADMIN_PASSWORD is required}',
    );
    expect(productionCompose).toContain('image: redis:7.4-alpine');
    expect(productionCompose).toContain(
      'REDIS_PASSWORD: ${REDIS_PASSWORD:?REDIS_PASSWORD is required}',
    );
    const redisBlock = productionCompose
      .split('\n  redis:')[1]
      .split('\n  nginx:')[0];
    expect(redisBlock).toContain('expose:\n      - "6379"');
    expect(redisBlock).not.toContain('ports:');
    expect(productionCompose).toContain('AUTO_SEED: "false"');
  });

  it('terminates TLS, redirects HTTP, and does not publish metrics', () => {
    const productionCompose = readRootFile('docker-compose.production.yml');
    const nginx = readRootFile('nginx/nginx.production.conf');

    expect(productionCompose).toContain('${HTTPS_PORT:-443}:443');
    expect(productionCompose).toContain(
      'TLS_CERT_FILE:?TLS_CERT_FILE is required',
    );
    expect(productionCompose).toContain(
      'TLS_KEY_FILE:?TLS_KEY_FILE is required',
    );
    expect(nginx).toContain('listen 443 ssl;');
    expect(nginx).toContain('ssl_protocols TLSv1.2 TLSv1.3;');
    expect(nginx).toContain('return 301 https://$host$request_uri;');
    expect(nginx).toContain('Strict-Transport-Security');
    expect(nginx).toContain('location = /api/metrics');
    expect(nginx).toContain('location /grafana/');
  });

  it('generates cryptographic secrets without printing them', () => {
    const generator = readRootFile('deploy/Generate-ProductionEnv.ps1');

    expect(generator).toContain(
      '[System.Security.Cryptography.RandomNumberGenerator]::Create()',
    );
    expect(generator).toContain('$generator.GetBytes($bytes)');
    expect(generator).toContain('$jwtSecret = -join');
    expect(generator).toContain('(New-RandomBytes -ByteCount 32)');
    expect(generator).toContain("$OutputPath = '.env.production'");
    expect(generator).toContain('openssl rand -hex 32');
    expect(generator).toContain(
      'Secrets were generated with a cryptographic random number generator and were not printed.',
    );
    expect(generator).not.toContain('Write-Host $jwtSecret');
  });

  it('backs up PostgreSQL before running migrations', () => {
    const migration = readRootFile('deploy/Invoke-ProductionMigration.ps1');
    const backupIndex = migration.indexOf('pg_dump');
    const migrationIndex = migration.indexOf("'migration:run'");

    expect(backupIndex).toBeGreaterThan(-1);
    expect(migrationIndex).toBeGreaterThan(backupIndex);
    expect(migration).toContain('--format=custom');
    expect(migration).toContain("'--project-name', 'ticket-system'");
    expect(migration).toContain('[switch]$RunSeed');
    expect(migration).toContain('[switch]$ImportLegacyPermissions');
    expect(migration).toContain("'permission:migrate-legacy'");
  });
});
