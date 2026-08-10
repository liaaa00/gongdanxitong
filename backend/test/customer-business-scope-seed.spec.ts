import { DataSource, QueryRunner } from 'typeorm';
import { BusinessScope } from 'src/entities';
import { BackfillOutOfProvinceCustomers20260809002000 } from 'src/database/migrations/20260809002000-BackfillOutOfProvinceCustomers';
import { seedCustomers } from 'src/database/seeds/seed-customers';

describe('customer business scope bootstrap', () => {
  it('backfills missing out-of-province customers without overwriting existing rows', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;
    const migration = new BackfillOutOfProvinceCustomers20260809002000();

    await migration.up(queryRunner);

    const sql = (queryRunner.query as jest.Mock).mock.calls[0][0] as string;
    expect(sql).toContain("source.business_scope = 'beilun'");
    expect(sql).toContain("'out_of_province'");
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('target.customer_code = source.customer_code');
    expect(sql).toContain("target.business_scope = 'out_of_province'");
  });

  it('seeds customer options independently for both business scopes', async () => {
    const repository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const dataSource = {
      getRepository: jest.fn(() => repository),
    } as unknown as DataSource;

    await seedCustomers(dataSource);

    expect(repository.findOne).toHaveBeenCalledTimes(6);
    expect(repository.save).toHaveBeenCalledTimes(6);
    expect(repository.create.mock.calls.map(([value]) => value.businessScope)).toEqual([
      BusinessScope.BEILUN,
      BusinessScope.BEILUN,
      BusinessScope.BEILUN,
      BusinessScope.OUT_OF_PROVINCE,
      BusinessScope.OUT_OF_PROVINCE,
      BusinessScope.OUT_OF_PROVINCE,
    ]);
  });
});
