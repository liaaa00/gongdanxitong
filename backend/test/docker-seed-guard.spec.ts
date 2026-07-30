import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readBackendFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Docker database seed guard', () => {
  it('runs seed only when AUTO_SEED or SEED_ON_BOOT explicitly enables it', () => {
    const entrypoint = readBackendFile('docker-entrypoint.sh');

    expect(entrypoint).toContain('seed_enabled="${AUTO_SEED:-${SEED_ON_BOOT:-false}}"');
    expect(entrypoint).toMatch(/if \[ "\$seed_enabled" = "true" \]; then[\s\S]*npm run seed[\s\S]*fi/);
    expect(entrypoint).toContain('export AUTO_SEED=false');
  });

  it('keeps automatic seed disabled by default in Docker Compose', () => {
    const compose = readFileSync(join(process.cwd(), '..', 'docker-compose.yml'), 'utf8');

    expect(compose).toContain('AUTO_SEED: ${AUTO_SEED:-false}');
  });
});
