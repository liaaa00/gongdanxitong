import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), '..');

function readRootFile(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('Production deployment assets', () => {
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
    expect(generator).toContain('$jwtSecret = New-RandomSecret');
    expect(generator).toContain('$jwtRefreshSecret = New-RandomSecret');
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
  });
});
