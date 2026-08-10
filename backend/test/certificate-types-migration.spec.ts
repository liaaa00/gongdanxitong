import { QueryRunner } from 'typeorm';
import { EnsureCertificateTypes20260804001500 } from 'src/database/migrations/20260804001500-EnsureCertificateTypes';

describe('EnsureCertificateTypes20260804001500 migration', () => {
  it('creates the missing certificate_types table before scope isolation', async () => {
    const queryRunner = {
      hasTable: jest.fn(async () => false),
      query: jest.fn(async () => []),
    } as unknown as QueryRunner & { hasTable: jest.Mock; query: jest.Mock };
    const migration = new EnsureCertificateTypes20260804001500();

    await migration.up(queryRunner);

    expect(queryRunner.hasTable).toHaveBeenCalledWith('certificate_types');
    expect(queryRunner.query).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE certificate_types'));
    expect(queryRunner.query).toHaveBeenCalledWith(expect.stringContaining('template_url VARCHAR(500)'));
  });

  it('does nothing when certificate_types already exists', async () => {
    const queryRunner = {
      hasTable: jest.fn(async () => true),
      query: jest.fn(async () => []),
    } as unknown as QueryRunner & { hasTable: jest.Mock; query: jest.Mock };
    const migration = new EnsureCertificateTypes20260804001500();

    await migration.up(queryRunner);

    expect(queryRunner.query).not.toHaveBeenCalled();
  });

  it('does not drop certificate configuration data on rollback', async () => {
    const queryRunner = { query: jest.fn(async () => []) } as unknown as QueryRunner & { query: jest.Mock };
    const migration = new EnsureCertificateTypes20260804001500();

    await migration.down(queryRunner);

    expect(queryRunner.query).not.toHaveBeenCalled();
  });
});
